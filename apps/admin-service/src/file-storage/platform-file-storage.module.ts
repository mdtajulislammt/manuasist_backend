import { FileStorageModule } from '@menu-assist/file-storage';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InternalFilesController } from './internal-files.controller';
import { PublicFilesController } from './public-files.controller';
import { StorageSettingsController } from './storage-settings.controller';
import { FileStorageService } from './file-storage.service';
import { InternalApiKeyGuard } from '../internal-api-key.guard';

@Module({
  imports: [
    FileStorageModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const bucket = config.get<string>('AWS_S3_BUCKET');
        const region = config.get<string>('AWS_REGION');
        return {
          localRoot: config.get<string>('FILE_STORAGE_LOCAL_ROOT') ?? 'uploads',
          s3:
            bucket && region
              ? {
                  bucket,
                  region,
                  accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID'),
                  secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY'),
                  publicBaseUrl: config.get<string>('AWS_S3_PUBLIC_BASE_URL'),
                }
              : undefined,
        };
      },
    }),
  ],
  controllers: [
    StorageSettingsController,
    PublicFilesController,
    InternalFilesController,
  ],
  providers: [FileStorageService, InternalApiKeyGuard],
  exports: [FileStorageService],
})
export class PlatformFileStorageModule {}
