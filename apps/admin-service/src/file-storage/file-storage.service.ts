import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  LOCAL_FILE_STORAGE,
  S3_FILE_STORAGE,
  StorageProvider,
  type FileStoragePort,
} from '@menu-assist/file-storage';
import {
  StorageProvider as DbStorageProvider,
  StoredFile,
  StoredFileNamespace,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import {
  NAMESPACE_LOCAL_DIR,
  NAMESPACE_POLICIES,
  UUID_STORED_NAME_RE,
} from './file-storage.constants';

export type FileUploadInput = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type StoredFileDto = {
  id: string;
  storedName: string;
  namespace: StoredFileNamespace;
  provider: DbStorageProvider;
  contentType: string;
  sizeBytes: number;
  objectKey: string;
  displayName?: string;
  publicUrl: string;
  createdAt: Date;
};

const SETTINGS_ID = 'default';

@Injectable()
export class FileStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(LOCAL_FILE_STORAGE) private readonly local: FileStoragePort,
    @Optional() @Inject(S3_FILE_STORAGE) private readonly s3: FileStoragePort | null,
  ) {}

  isS3Configured(): boolean {
    return Boolean(
      this.config.get<string>('AWS_S3_BUCKET') &&
        this.config.get<string>('AWS_REGION'),
    );
  }

  isLocalConfigured(): boolean {
    return Boolean(this.config.get<string>('FILE_STORAGE_LOCAL_ROOT') ?? 'uploads');
  }

  async getSettings() {
    const row = await this.ensureSettings();
    return {
      activeProvider: row.activeProvider,
      s3Configured: this.isS3Configured() && Boolean(this.s3),
      localAvailable: this.isLocalConfigured(),
    };
  }

  async updateSettings(activeProvider: DbStorageProvider) {
    if (activeProvider === DbStorageProvider.S3) {
      if (!this.isS3Configured() || !this.s3) {
        throw new BadRequestException(
          'S3 storage is not configured. Set AWS_REGION, AWS_S3_BUCKET, and credentials (or IAM role).',
        );
      }
    }
    const row = await this.prisma.platformStorageSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, activeProvider },
      update: { activeProvider },
    });
    return {
      activeProvider: row.activeProvider,
      s3Configured: this.isS3Configured() && Boolean(this.s3),
      localAvailable: this.isLocalConfigured(),
    };
  }

  async getActiveProvider(): Promise<DbStorageProvider> {
    const row = await this.ensureSettings();
    return row.activeProvider;
  }

  validateUpload(namespace: StoredFileNamespace, file: FileUploadInput) {
    const policy = NAMESPACE_POLICIES[namespace];
    if (!policy) {
      throw new BadRequestException(`Unknown file namespace: ${namespace}`);
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing file');
    }
    if (file.size > policy.maxBytes) {
      throw new BadRequestException(`File too large (max ${policy.maxBytes} bytes)`);
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!policy.allowedMime.has(mime)) {
      throw new BadRequestException('Unsupported content type for this namespace');
    }
    const ext = this.extFromMime(mime);
    if (!ext) {
      throw new BadRequestException('Could not derive file extension from MIME type');
    }
    return { mime, ext };
  }

  buildPublicUrl(namespace: StoredFileNamespace, storedName: string): string {
    const policy = NAMESPACE_POLICIES[namespace];
    return `${policy.publicPath}/${storedName}`;
  }

  toDto(row: StoredFile): StoredFileDto {
    return {
      id: row.id,
      storedName: row.storedName,
      namespace: row.namespace,
      provider: row.provider,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      objectKey: row.objectKey,
      ...(row.displayName ? { displayName: row.displayName } : {}),
      publicUrl: this.buildPublicUrl(row.namespace, row.storedName),
      createdAt: row.createdAt,
    };
  }

  async storeNew(
    namespace: StoredFileNamespace,
    file: FileUploadInput,
    displayName?: string,
  ): Promise<StoredFileDto> {
    const { mime, ext } = this.validateUpload(namespace, file);
    const provider = await this.getActiveProvider();
    const adapter = this.adapterFor(provider);
    const storedName = `${randomUUID()}${ext}`;
    const objectKey = `${namespace}/${storedName}`;

    await adapter.put({
      namespace: this.localNamespaceKey(namespace, provider),
      storedName,
      buffer: file.buffer,
      contentType: mime,
    });

    const row = await this.prisma.storedFile.create({
      data: {
        storedName,
        namespace,
        provider,
        contentType: mime,
        sizeBytes: file.size,
        objectKey,
        displayName: displayName || null,
      },
    });
    return this.toDto(row);
  }

  async replaceExisting(
    namespace: StoredFileNamespace,
    storedName: string,
    file: FileUploadInput,
    displayName?: string | null,
  ): Promise<StoredFileDto> {
    const row = await this.findByNamespaceAndName(namespace, storedName);
    const { mime, ext } = this.validateUpload(namespace, file);
    const existingExt = extname(row.storedName).toLowerCase();
    const incomingExt = ext.toLowerCase();
    if (existingExt.replace('.jpeg', '.jpg') !== incomingExt.replace('.jpeg', '.jpg')) {
      throw new BadRequestException(
        'Replacement file must use the same extension family as the existing file',
      );
    }

    const adapter = this.adapterFor(row.provider);
    await adapter.replace({
      namespace: this.localNamespaceKey(namespace, row.provider),
      storedName,
      buffer: file.buffer,
      contentType: mime,
    });

    const updated = await this.prisma.storedFile.update({
      where: { id: row.id },
      data: {
        contentType: mime,
        sizeBytes: file.size,
        ...(displayName === undefined
          ? {}
          : { displayName: displayName === '' ? null : displayName }),
      },
    });
    return this.toDto(updated);
  }

  async deleteStored(namespace: StoredFileNamespace, storedName: string) {
    const row = await this.findByNamespaceAndName(namespace, storedName);
    const adapter = this.adapterFor(row.provider);
    await adapter.delete({
      namespace: this.localNamespaceKey(namespace, row.provider),
      objectKey: row.objectKey,
    });
    await this.prisma.storedFile.delete({ where: { id: row.id } });
    return { deleted: true as const, storedName };
  }

  async getStream(namespace: StoredFileNamespace, storedName: string) {
    const row = await this.findByNamespaceAndName(namespace, storedName);
    const adapter = this.adapterFor(row.provider);
    const result = await adapter.getStream({
      namespace: this.localNamespaceKey(namespace, row.provider),
      storedName,
      objectKey: row.objectKey,
    });
    return {
      stream: result.stream,
      contentType: row.contentType,
    };
  }

  async listByNamespace(namespace: StoredFileNamespace) {
    const rows = await this.prisma.storedFile.findMany({
      where: { namespace },
      orderBy: { storedName: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async findById(id: string) {
    const row = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('File not found');
    }
    return this.toDto(row);
  }

  async deleteById(id: string) {
    const row = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('File not found');
    }
    return this.deleteStored(row.namespace, row.storedName);
  }

  assertValidStoredName(storedName: string) {
    if (!UUID_STORED_NAME_RE.test(storedName)) {
      throw new BadRequestException('Invalid stored file name');
    }
  }

  private async ensureSettings() {
    return this.prisma.platformStorageSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, activeProvider: DbStorageProvider.LOCAL },
      update: {},
    });
  }

  private async findByNamespaceAndName(
    namespace: StoredFileNamespace,
    storedName: string,
  ): Promise<StoredFile> {
    this.assertValidStoredName(storedName);
    const row = await this.prisma.storedFile.findFirst({
      where: { namespace, storedName },
    });
    if (!row) {
      throw new NotFoundException('File not found');
    }
    return row;
  }

  private adapterFor(provider: DbStorageProvider): FileStoragePort {
    if (provider === DbStorageProvider.S3) {
      if (!this.s3) {
        throw new BadRequestException('S3 adapter is not available');
      }
      return this.s3;
    }
    return this.local;
  }

  /** Local disk uses legacy folder names; S3 uses enum string as prefix segment. */
  private localNamespaceKey(
    namespace: StoredFileNamespace,
    provider: DbStorageProvider,
  ): string {
    if (provider === DbStorageProvider.S3) {
      return namespace;
    }
    return NAMESPACE_LOCAL_DIR[namespace];
  }

  private extFromMime(mime: string): string | undefined {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/octet-stream': '.bin',
    };
    return map[mime.toLowerCase()];
  }
}
