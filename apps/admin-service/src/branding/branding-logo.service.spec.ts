import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StoredFileNamespace,
  StorageProvider,
} from '../../generated/prisma/client';
import {
  FileStorageService,
  type StoredFileDto,
} from '../file-storage/file-storage.service';
import { BrandingLogoService } from './branding-logo.service';

jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: class {},
  StoredFileNamespace: { LOGO: 'LOGO' },
  StorageProvider: { LOCAL: 'LOCAL' },
}));

function storedLogo(storedName: string, createdAt: Date): StoredFileDto {
  return {
    id: storedName,
    storedName,
    namespace: StoredFileNamespace.LOGO,
    provider: StorageProvider.LOCAL,
    contentType: 'image/png',
    sizeBytes: 128,
    objectKey: `LOGO/${storedName}`,
    publicUrl: `/files/logo/${storedName}`,
    createdAt,
  };
}

describe('BrandingLogoService', () => {
  const oldLogo = storedLogo(
    '11111111-1111-4111-8111-111111111111.png',
    new Date('2026-08-11T00:00:00.000Z'),
  );
  const newLogo = storedLogo(
    '22222222-2222-4222-8222-222222222222.png',
    new Date('2026-08-12T00:00:00.000Z'),
  );

  const files = {
    listByNamespace: jest.fn(),
    storeNew: jest.fn(),
    deleteStored: jest.fn(),
    getStream: jest.fn(),
  };
  const config = {
    get: jest.fn(() => 'https://menu-assist.example.com/v1/admin'),
  };
  const service = new BrandingLogoService(
    files as unknown as FileStorageService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads a new shared logo and removes the previous file', async () => {
    files.listByNamespace.mockResolvedValue([oldLogo]);
    files.storeNew.mockResolvedValue(newLogo);
    files.deleteStored.mockResolvedValue({ deleted: true });

    const result = await service.uploadLogo({
      buffer: Buffer.from('logo'),
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 4,
    });

    expect(files.storeNew).toHaveBeenCalledWith(
      StoredFileNamespace.LOGO,
      expect.objectContaining({ mimetype: 'image/png' }),
      'primary-logo',
    );
    expect(files.deleteStored).toHaveBeenCalledWith(
      StoredFileNamespace.LOGO,
      oldLogo.storedName,
    );
    expect(result).toEqual({
      logoUrl: 'https://menu-assist.example.com/v1/admin/branding/logo',
      contentType: 'image/png',
      sizeBytes: 128,
      updatedAt: newLogo.createdAt,
    });
  });

  it('streams the newest stored logo', async () => {
    const streamResult = {
      stream: { pipe: jest.fn() },
      contentType: 'image/png',
    };
    files.listByNamespace.mockResolvedValue([oldLogo, newLogo]);
    files.getStream.mockResolvedValue(streamResult);

    await expect(service.getLogoStream()).resolves.toBe(streamResult);
    expect(files.getStream).toHaveBeenCalledWith(
      StoredFileNamespace.LOGO,
      newLogo.storedName,
    );
  });

  it('returns not found when no logo has been uploaded', async () => {
    files.listByNamespace.mockResolvedValue([]);

    await expect(service.getLogo()).rejects.toBeInstanceOf(NotFoundException);
  });
});
