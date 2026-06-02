import { Module } from '@nestjs/common';
import { AdminInternalModule } from '../admin-internal/admin-internal.module';
import { AuthInternalModule } from '../auth-internal/auth-internal.module';
import { ProfileFilesController } from './profile-files.controller';
import { ProfileAvatarStorageService } from './profile-avatar-storage.service';
import { UsersMeController } from './users-me.controller';
import { UsersMeService } from './users-me.service';

@Module({
  imports: [AdminInternalModule, AuthInternalModule],
  controllers: [ProfileFilesController, UsersMeController],
  providers: [ProfileAvatarStorageService, UsersMeService],
  exports: [UsersMeService],
})
export class UsersMeModule {}
