import { Module } from '@nestjs/common';
import { PlatformFileStorageModule } from '../file-storage/platform-file-storage.module';
import { UsersService } from '../users/users.service';
import { ProfileAvatarService } from './profile-avatar.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [PlatformFileStorageModule],
  controllers: [ProfileController],
  providers: [ProfileService, ProfileAvatarService, UsersService],
})
export class ProfileModule {}
