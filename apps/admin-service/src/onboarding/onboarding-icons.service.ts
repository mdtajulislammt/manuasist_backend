import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OnboardingFlowStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

/** Multipart file shape from multer memory storage. */
export type OnboardingIconUploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

function normalizeImageExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === '.jpeg') return '.jpg';
  return e;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** Stored filenames: UUID v4 + allowed extension. */
const UUID_FILE_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\.[a-z0-9]+)$/i;

function isValidStoredIconFilename(name: string): boolean {
  const m = name.match(UUID_FILE_RE);
  return Boolean(m && ALLOWED_EXT.has(m[2].toLowerCase()));
}

function metaJsonPath(imageFullPath: string): string {
  return `${imageFullPath}.meta.json`;
}

/**
 * Optional **admin-assigned label** for an icon (e.g. `spice_mild`), stored in
 * a sidecar meta file. This is not the on-disk filename (always UUID + ext)
 * and not the multipart file’s original name.
 */
export function normalizeIconNameInput(raw?: string): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const s = String(raw).trim();
  if (!s) {
    return undefined;
  }
  if (s.length > 128) {
    throw new BadRequestException('iconName must be at most 128 characters');
  }
  if (!/^[\w.-]+$/.test(s)) {
    throw new BadRequestException(
      'iconName may only contain letters, digits, underscore, hyphen, and dot',
    );
  }
  return s;
}

@Injectable()
export class OnboardingIconsService {
  constructor(private readonly prisma: PrismaService) {}

  private uploadDir(): string {
    return join(process.cwd(), 'uploads', 'onboarding-icons');
  }

  private ensureDir() {
    const dir = this.uploadDir();
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private physicalPath(filename: string): string {
    const m = filename.match(UUID_FILE_RE);
    if (!m || !ALLOWED_EXT.has(m[2].toLowerCase())) {
      throw new BadRequestException('Invalid icon filename');
    }
    return join(this.uploadDir(), filename);
  }

  private extFromMime(mime: string): string | undefined {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    return map[mime.toLowerCase()];
  }

  private readStoredIconName(imageFullPath: string): string | undefined {
    const metaPath = metaJsonPath(imageFullPath);
    if (!existsSync(metaPath)) {
      return undefined;
    }
    try {
      const raw = readFileSync(metaPath, 'utf8');
      const parsed = JSON.parse(raw) as { iconName?: unknown };
      if (typeof parsed.iconName === 'string' && parsed.iconName.trim()) {
        return parsed.iconName.trim();
      }
    } catch {
      /* ignore corrupt sidecar */
    }
    return undefined;
  }

  private setIconNameMeta(imageFullPath: string, iconName: string) {
    writeFileSync(
      metaJsonPath(imageFullPath),
      JSON.stringify({ iconName }, null, 0),
      'utf8',
    );
  }

  private unlinkIconNameMeta(imageFullPath: string) {
    const metaPath = metaJsonPath(imageFullPath);
    if (existsSync(metaPath)) {
      unlinkSync(metaPath);
    }
  }

  mimeForFilename(filename: string): string {
    const ext = extname(filename).toLowerCase();
    const map: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  async assertOptionalDraftStep(stepId?: string) {
    if (!stepId) return;
    const step = await this.prisma.onboardingStep.findUnique({
      where: { id: stepId },
      include: { flow: true },
    });
    if (!step) {
      throw new BadRequestException('stepId does not match any step');
    }
    if (step.flow.status !== OnboardingFlowStatus.DRAFT) {
      throw new BadRequestException('Icons can only be uploaded while the flow is in DRAFT');
    }
  }

  validateFile(file: OnboardingIconUploadFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing file');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`File too large (max ${MAX_BYTES} bytes)`);
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        'Unsupported image type. Allowed: PNG, JPEG, GIF, WebP, SVG',
      );
    }
    const extFromName = extname(file.originalname || '').toLowerCase();
    if (extFromName && !ALLOWED_EXT.has(extFromName)) {
      throw new BadRequestException('Unsupported file extension');
    }
    const ext = this.extFromMime(mime);
    if (!ext) {
      throw new BadRequestException('Could not derive file extension from MIME type');
    }
    return { mime, ext };
  }

  /**
   * Saves a new icon and returns a path to use in `uiConfig.options[].icon`
   * (same origin as admin service, or prefix with public base URL in clients).
   * `iconName` is an optional **admin label** in sidecar meta, not the generated `filename`.
   */
  async saveNewIcon(
    file: OnboardingIconUploadFile,
    stepId?: string,
    iconName?: string,
  ): Promise<{ filename: string; iconUrl: string; iconName?: string }> {
    await this.assertOptionalDraftStep(stepId);
    const { ext } = this.validateFile(file);
    const dir = this.ensureDir();
    const filename = `${randomUUID()}${ext}`;
    const full = join(dir, filename);
    writeFileSync(full, file.buffer);
    if (iconName !== undefined && iconName !== '') {
      this.setIconNameMeta(full, iconName);
    }
    const stored = this.readStoredIconName(full);
    return {
      filename,
      iconUrl: `/onboarding/icons/${filename}`,
      ...(stored ? { iconName: stored } : {}),
    };
  }

  /** `iconName`: admin meta label only; `undefined` keeps existing, `''` clears. */
  async replaceIcon(
    filename: string,
    file: OnboardingIconUploadFile,
    stepId?: string,
    iconName?: string,
  ): Promise<{ filename: string; iconUrl: string; iconName?: string }> {
    await this.assertOptionalDraftStep(stepId);
    this.validateFile(file);
    const target = this.physicalPath(filename);
    if (!existsSync(target)) {
      throw new NotFoundException('Icon not found');
    }
    const dir = this.ensureDir();
    const ext = normalizeImageExt(extname(filename));
    const incomingExt = this.extFromMime(file.mimetype.toLowerCase());
    if (!incomingExt || normalizeImageExt(incomingExt) !== ext) {
      throw new BadRequestException(
        'Replacement file must use the same image type as the existing icon (e.g. PNG → PNG)',
      );
    }
    writeFileSync(join(dir, filename), file.buffer);
    const full = join(dir, filename);
    if (iconName === undefined) {
      // keep existing sidecar
    } else if (iconName === '') {
      this.unlinkIconNameMeta(full);
    } else {
      this.setIconNameMeta(full, iconName);
    }
    const stored = this.readStoredIconName(full);
    return {
      filename,
      iconUrl: `/onboarding/icons/${filename}`,
      ...(stored ? { iconName: stored } : {}),
    };
  }

  async deleteIcon(filename: string, stepId?: string) {
    await this.assertOptionalDraftStep(stepId);
    const target = this.physicalPath(filename);
    if (!existsSync(target)) {
      throw new NotFoundException('Icon not found');
    }
    this.unlinkIconNameMeta(target);
    unlinkSync(target);
    return { deleted: true as const, filename };
  }

  getReadStream(filename: string) {
    const target = this.physicalPath(filename);
    if (!existsSync(target)) {
      throw new NotFoundException('Icon not found');
    }
    return {
      stream: createReadStream(target),
      contentType: this.mimeForFilename(filename),
    };
  }

  /**
   * Lists all icon files under `uploads/onboarding-icons/` (UUID + allowed extension only).
   */
  listAllIcons(): {
    icons: Array<{
      filename: string;
      iconUrl: string;
      iconName?: string;
      sizeBytes: number;
      contentType: string;
    }>;
  } {
    const dir = this.uploadDir();
    if (!existsSync(dir)) {
      return { icons: [] };
    }
    const names = readdirSync(dir).filter((n) => isValidStoredIconFilename(n));
    names.sort((a, b) => a.localeCompare(b));
    const icons = names.map((filename) => {
      const full = join(dir, filename);
      const { size } = statSync(full);
      const iconName = this.readStoredIconName(full);
      return {
        filename,
        iconUrl: `/onboarding/icons/${filename}`,
        ...(iconName ? { iconName } : {}),
        sizeBytes: size,
        contentType: this.mimeForFilename(filename),
      };
    });
    return { icons };
  }
}
