import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FILE_NAMESPACE } from '../file-storage/file-storage.constants';
import {
  FileStorageService,
  type FileUploadInput,
  type StoredFileDto,
} from '../file-storage/file-storage.service';

const LOGO_NAMESPACE = FILE_NAMESPACE.LOGO;

export type BrandingLogoDto = {
  logoUrl: string;
  contentType: string;
  sizeBytes: number;
  updatedAt: Date;
};

@Injectable()
export class BrandingLogoService {
  constructor(
    private readonly files: FileStorageService,
    private readonly config: ConfigService,
  ) {}

  async getLogo(): Promise<BrandingLogoDto> {
    return this.toDto(await this.getCurrentStoredLogo());
  }

  async uploadLogo(file: FileUploadInput): Promise<BrandingLogoDto> {
    const previousFiles = await this.files.listByNamespace(LOGO_NAMESPACE);
    const stored = await this.files.storeNew(
      LOGO_NAMESPACE,
      file,
      'primary-logo',
    );

    await Promise.allSettled(
      previousFiles.map((previous) =>
        this.files.deleteStored(LOGO_NAMESPACE, previous.storedName),
      ),
    );

    return this.toDto(stored);
  }

  async deleteLogo(): Promise<{ deleted: true }> {
    const storedFiles = await this.files.listByNamespace(LOGO_NAMESPACE);
    if (storedFiles.length === 0) {
      throw new NotFoundException('Logo not found');
    }

    await Promise.all(
      storedFiles.map((stored) =>
        this.files.deleteStored(LOGO_NAMESPACE, stored.storedName),
      ),
    );
    return { deleted: true };
  }

  async getLogoStream() {
    const stored = await this.getCurrentStoredLogo();
    return this.files.getStream(LOGO_NAMESPACE, stored.storedName);
  }

  private async getCurrentStoredLogo(): Promise<StoredFileDto> {
    const storedFiles = await this.files.listByNamespace(LOGO_NAMESPACE);
    const current = storedFiles.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    )[0];
    if (!current) {
      throw new NotFoundException('Logo not found');
    }
    return current;
  }

  private toDto(stored: StoredFileDto): BrandingLogoDto {
    return {
      logoUrl: this.buildPublicLogoUrl(),
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
      updatedAt: stored.createdAt,
    };
  }

  private buildPublicLogoUrl(): string {
    const baseUrl = (
      this.config.get<string>('FILE_STORAGE_PUBLIC_URL') ?? ''
    ).replace(/\/+$/, '');
    return `${baseUrl}/branding/logo`;
  }
}
