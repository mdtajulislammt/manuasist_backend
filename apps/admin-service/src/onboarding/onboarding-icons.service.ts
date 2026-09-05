import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnboardingFlowStatus } from '../../generated/prisma/client';
import { FILE_NAMESPACE } from '../file-storage/file-storage.constants';
import { FileStorageService } from '../file-storage/file-storage.service';
import { PrismaService } from '../prisma.service';

/** Multipart file shape from multer memory storage. */
export type OnboardingIconUploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const NS = FILE_NAMESPACE.ONBOARDING_ICON;

const STORED_FILE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Optional **admin-assigned label** for an icon (e.g. `Peanuts`).
 * Not the stored UUID filename and not the upload file name.
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileStorageService,
  ) { }

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
    this.files.validateUpload(NS, file);
    const mime = (file.mimetype || '').toLowerCase();
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    const ext = map[mime];
    if (!ext) {
      throw new BadRequestException('Could not derive file extension from MIME type');
    }
    return { mime, ext };
  }

  async saveNewIcon(
    file: OnboardingIconUploadFile,
    stepId?: string,
    iconName?: string,
  ): Promise<{ filename: string; iconUrl: string; iconName?: string }> {
    await this.assertOptionalDraftStep(stepId);
    const stored = await this.files.storeNew(NS, file, iconName);
    return {
      filename: stored.storedName,
      iconUrl: stored.publicUrl,
      ...(stored.displayName ? { iconName: stored.displayName } : {}),
    };
  }

  async replaceIcon(
    filename: string,
    file: OnboardingIconUploadFile,
    stepId?: string,
    iconName?: string,
  ): Promise<{ filename: string; iconUrl: string; iconName?: string }> {
    await this.assertOptionalDraftStep(stepId);
    this.files.assertValidStoredName(filename);
    const displayName =
      iconName === undefined ? undefined : iconName === '' ? '' : normalizeIconNameInput(iconName);
    const stored = await this.files.replaceExisting(NS, filename, file, displayName);
    return {
      filename: stored.storedName,
      iconUrl: stored.publicUrl,
      ...(stored.displayName ? { iconName: stored.displayName } : {}),
    };
  }

  async deleteIcon(filename: string, stepId?: string) {
    await this.assertOptionalDraftStep(stepId);
    this.files.assertValidStoredName(filename);
    await this.files.deleteStored(NS, filename);
    return { deleted: true as const, filename };
  }

  async deleteIconById(id: string, stepId?: string) {
    await this.assertOptionalDraftStep(stepId);
    const row = await this.files.findById(id);
    if (row.namespace !== NS) {
      throw new NotFoundException('Icon not found');
    }
    await this.files.deleteById(id);
    return { deleted: true as const, id, filename: row.storedName };
  }

  async deleteIconByIdOrFilename(idOrFilename: string, stepId?: string) {
    if (STORED_FILE_ID_RE.test(idOrFilename)) {
      return this.deleteIconById(idOrFilename, stepId);
    }
    return this.deleteIcon(idOrFilename, stepId);
  }

  async getReadStream(filename: string) {
    this.files.assertValidStoredName(filename);
    try {
      return await this.files.getStream(NS, filename);
    } catch {
      throw new NotFoundException('Icon not found');
    }
  }

  async listAllIcons(): Promise<{
    icons: Array<{
      id: string;
      filename: string;
      iconUrl: string;
      iconName?: string;
      sizeBytes: number;
      contentType: string;
      provider?: string;
    }>;
  }> {
    const rows = await this.files.listByNamespace(NS);
    return {
      icons: rows.map((r) => ({
        id: r.id,
        filename: r.storedName,
        iconUrl: process.env.FILE_STORAGE_PUBLIC_URL + r.publicUrl,
        ...(r.displayName ? { iconName: r.displayName } : {}),
        iconName: r.displayName || undefined,
        sizeBytes: r.sizeBytes,
        contentType: r.contentType,
        provider: r.provider.toString(),
      })),
    };
  }
}
