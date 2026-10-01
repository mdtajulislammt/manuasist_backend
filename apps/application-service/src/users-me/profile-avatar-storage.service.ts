import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LOCAL_FILE_STORAGE,
  S3_FILE_STORAGE,
  StorageProvider,
  type FileStoragePort,
} from '@menu-assist/file-storage';
import { randomUUID } from 'node:crypto';
import {
  isHeicImage,
  resolveAvatarContentType,
} from './profile-avatar-content.util';

export type ProfileAvatarUpload = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type StoredProfileAvatar = {
  avatarFileId: string;
  storedName: string;
  avatarUrl: string;
};

const AVATAR_NAMESPACE = 'USER_AVATAR';
const AVATAR_URL_NAMESPACE = 'user-avatar';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const UUID_STORED_NAME_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\.[a-z0-9]+)$/i;

@Injectable()
export class ProfileAvatarStorageService {
  constructor(
    private readonly config: ConfigService,
    @Inject(LOCAL_FILE_STORAGE) private readonly local: FileStoragePort,
    @Optional()
    @Inject(S3_FILE_STORAGE)
    private readonly s3: FileStoragePort | null,
  ) { }

  async storeAvatar(file: ProfileAvatarUpload): Promise<StoredProfileAvatar> {
    const { mime, ext } = this.validateAvatar(file);
    const avatarFileId = randomUUID();
    const storedName = `${avatarFileId}${ext}`;
    const adapter = this.writeAdapter();
    const ref = await adapter.put({
      namespace: AVATAR_NAMESPACE,
      storedName,
      buffer: file.buffer,
      contentType: mime,
    });

    return {
      avatarFileId,
      storedName,
      avatarUrl: this.buildPublicUrl(ref.provider, ref.objectKey, storedName),
    };
  }

  async getAvatarStream(storedName: string) {
    this.assertValidStoredName(storedName);
    const adapter = this.readAdapter();
    const result = await adapter.getStream({
      namespace: AVATAR_NAMESPACE,
      storedName,
      objectKey: `${AVATAR_NAMESPACE}/${storedName}`,
    });
    return {
      ...result,
      contentType: this.contentTypeFromStoredName(storedName),
    };
  }

  publicUrlForStoredName(storedName: string): string {
    this.assertValidStoredName(storedName);
    return this.buildPublicUrl(
      StorageProvider.LOCAL,
      `${AVATAR_NAMESPACE}/${storedName}`,
      storedName,
    );
  }

  normalizePublicUrl(avatarUrl: string | null): string | null {
    if (!avatarUrl) {
      return null;
    }

    const storedName = avatarUrl.match(/\/files\/user-avatar\/([^/?#]+)/)?.[1];
    return storedName ? this.publicUrlForStoredName(storedName) : avatarUrl;
  }

  private validateAvatar(file: ProfileAvatarUpload) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing avatar file');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException(
        `Avatar file too large (max ${MAX_AVATAR_BYTES} bytes)`,
      );
    }
    if (isHeicImage(file.buffer)) {
      throw new BadRequestException(
        'HEIC images are not supported. Use JPEG, PNG, or WebP.',
      );
    }

    const resolved = resolveAvatarContentType({
      mimetype: file.mimetype,
      originalname: file.originalname,
      buffer: file.buffer,
    });
    if (!resolved) {
      throw new BadRequestException(
        'Unsupported avatar content type. Use JPEG, PNG, or WebP.',
      );
    }
    return resolved;
  }

  private assertValidStoredName(storedName: string) {
    if (!UUID_STORED_NAME_RE.test(storedName)) {
      throw new BadRequestException('Invalid avatar file name');
    }
  }

  private writeAdapter(): FileStoragePort {
    return this.isS3Configured() && this.s3 ? this.s3 : this.local;
  }

  private readAdapter(): FileStoragePort {
    return this.writeAdapter();
  }

  private isS3Configured(): boolean {
    return Boolean(
      this.config.get<string>('AWS_S3_BUCKET') &&
      this.config.get<string>('AWS_REGION'),
    );
  }

  private buildPublicUrl(
    provider: StorageProvider,
    objectKey: string,
    storedName: string,
  ): string {
    const s3Base = this.config.get<string>('AWS_S3_PUBLIC_BASE_URL');
    if (provider === StorageProvider.S3 && s3Base) {
      return `${s3Base.replace(/\/$/, '')}/${objectKey}`;
    }

    const appBase =
      this.config.get<string>('APPLICATION_PUBLIC_URL') ??
      this.gatewayAppBaseUrl() ??
      this.config.get<string>('APPLICATION_SERVICE_URL') ??
      'http://localhost:4002';
    return `${appBase.replace(/\/$/, '')}/files/${AVATAR_URL_NAMESPACE}/${storedName}`;
  }

  private gatewayAppBaseUrl(): string | undefined {
    const gateway = this.config.get<string>('API_GATEWAY_PUBLIC_URL');
    return gateway ? `${gateway.replace(/\/$/, '')}/v1/app` : undefined;
  }

  private contentTypeFromStoredName(storedName: string): string {
    const ext = storedName.split('.').pop()?.toLowerCase();
    if (ext === 'png') {
      return 'image/png';
    }
    if (ext === 'webp') {
      return 'image/webp';
    }
    return 'image/jpeg';
  }
}
