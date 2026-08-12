import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type StoredFileUploadResult = {
  storedName: string;
  publicUrl: string;
  contentType: string;
};

type MulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Injectable()
export class AdminFileClientService {
  constructor(private readonly config: ConfigService) {}

  buildPublicImageUrl(storedName: string): string {
    const gateway = (
      this.config.get<string>('API_GATEWAY_PUBLIC_URL') ??
      'http://localhost:2645'
    ).replace(/\/$/, '');
    return `${gateway}/v1/admin/files/menu-scan/${storedName}`;
  }

  buildPublicDishImageUrl(storedName: string): string {
    const gateway = (
      this.config.get<string>('API_GATEWAY_PUBLIC_URL') ??
      'http://localhost:2645'
    ).replace(/\/$/, '');
    return `${gateway}/v1/admin/files/dish-image/${storedName}`;
  }

  async uploadMenuScan(file: MulterFile): Promise<StoredFileUploadResult> {
    return this.uploadFile('MENU_SCAN', file);
  }

  async uploadDishImage(input: {
    buffer: Buffer;
    contentType: 'image/png' | 'image/jpeg' | 'image/webp';
    displayName: string;
  }): Promise<StoredFileUploadResult> {
    const extension =
      input.contentType === 'image/png'
        ? 'png'
        : input.contentType === 'image/jpeg'
          ? 'jpg'
          : 'webp';
    return this.uploadFile(
      'DISH_IMAGE',
      {
        buffer: input.buffer,
        originalname: `${input.displayName}.${extension}`,
        mimetype: input.contentType,
        size: input.buffer.length,
      },
      input.displayName,
    );
  }

  private async uploadFile(
    namespace: 'MENU_SCAN' | 'DISH_IMAGE',
    file: MulterFile,
    displayName?: string,
  ): Promise<StoredFileUploadResult> {
    const base = this.config
      .getOrThrow<string>('ADMIN_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('ADMIN_INTERNAL_API_KEY');
    const form = new FormData();
    form.append('namespace', namespace);
    if (displayName) {
      form.append('displayName', displayName);
    }
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname || 'menu.jpg',
    );

    let res: Response;
    try {
      res = await fetch(`${base}/internal/files`, {
        method: 'POST',
        headers: { 'x-internal-api-key': key },
        body: form,
      });
    } catch (e) {
      throw new BadGatewayException(
        `Could not reach admin-service for file upload: ${String(e)}`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(
        `${namespace} upload failed (${res.status}): ${text.slice(0, 500)}`,
      );
    }
    const json = (await res.json()) as {
      data: { storedName: string; publicUrl: string; contentType: string };
    };
    return {
      storedName: json.data.storedName,
      publicUrl: json.data.publicUrl,
      contentType: json.data.contentType,
    };
  }

  async fetchMenuScanBytes(storedName: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const base = this.config
      .getOrThrow<string>('ADMIN_SERVICE_URL')
      .replace(/\/$/, '');
    const url = `${base}/files/menu-scan/${encodeURIComponent(storedName)}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new BadGatewayException(
        `Could not fetch menu scan image: ${String(e)}`,
      );
    }
    if (!res.ok) {
      throw new BadGatewayException(
        `Failed to load menu image (${res.status})`,
      );
    }
    const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
    const ab = await res.arrayBuffer();
    return { buffer: Buffer.from(ab), mimeType };
  }
}
