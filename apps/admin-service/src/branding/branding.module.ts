import { Module } from '@nestjs/common';
import { PlatformFileStorageModule } from '../file-storage/platform-file-storage.module';
import { BrandingLogoController } from './branding-logo.controller';
import { BrandingLogoService } from './branding-logo.service';

@Module({
  imports: [PlatformFileStorageModule],
  controllers: [BrandingLogoController],
  providers: [BrandingLogoService],
})
export class BrandingModule {}
