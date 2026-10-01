import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoredFileNamespace } from '../../generated/prisma/client';
import {
  FileStorageService,
  type FileUploadInput,
} from '../file-storage/file-storage.service';
import {
  isHeicImage,
  resolveAvatarContentType,
} from './profile-avatar.util';

@Injectable()
export class ProfileAvatarService {
  constructor(
    private readonly files: FileStorageService,
    private readonly config: ConfigService,
  ) {}

  async storeAvatar(file: FileUploadInput): Promise<string> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing avatar file');
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

    const stored = await this.files.storeNew(StoredFileNamespace.USER_AVATAR, {
      ...file,
      mimetype: resolved.mime,
    });

    const base =
      this.config.get<string>('FILE_STORAGE_PUBLIC_URL')?.replace(/\/$/, '') ??
      '';
    return `${base}${stored.publicUrl}`;
  }
}
