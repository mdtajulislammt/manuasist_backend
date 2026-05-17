import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { StorageProvider } from '../../../generated/prisma/client';

export class PatchStorageSettingsDto {
  @ApiProperty({ enum: StorageProvider, example: StorageProvider.LOCAL })
  @IsEnum(StorageProvider)
  activeProvider!: StorageProvider;
}
