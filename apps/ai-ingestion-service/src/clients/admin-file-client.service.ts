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
      'http://localhost:5000'
    ).replace(/\/$/, '');
    return `${gateway}/v1/admin/files/menu-scan/${storedName}`;
  }

  async uploadMenuScan(file: MulterFile): Promise<StoredFileUploadResult> {
    const base = this.config
      .getOrThrow<string>('ADMIN_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('ADMIN_INTERNAL_API_KEY');
    const form = new FormData();
    form.append('namespace', 'MENU_SCAN');
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
        `Menu image upload failed (${res.status}): ${text.slice(0, 500)}`,
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
