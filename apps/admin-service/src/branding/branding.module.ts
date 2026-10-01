import { Module } from '@nestjs/common';
import { PlatformFileStorageModule } from '../file-storage/platform-file-storage.module';
import { BrandingLogoController } from './branding-logo.controller';
import { BrandingLogoService } from './branding-logo.service';
import {
  LaunchContentAdminController,
  LaunchContentPublicController,
} from './launch-content.controller';
import { LaunchContentService } from './launch-content.service';

@Module({
  imports: [PlatformFileStorageModule],
  controllers: [
    BrandingLogoController,
    // Register the static public route before the admin `:id` route so
    // `/branding/launch-content/active` is not interpreted as id "active".
    LaunchContentPublicController,
    LaunchContentAdminController,
  ],
  providers: [BrandingLogoService, LaunchContentService],
})
export class BrandingModule {}
