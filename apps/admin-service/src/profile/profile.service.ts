import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import type { FileUploadInput } from '../file-storage/file-storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileAvatarService } from './profile-avatar.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly usersService: UsersService,
    private readonly avatars: ProfileAvatarService,
  ) {}

  async getProfile(id: string) {
    try {
      return await this.usersService.getUserById(id);
    } catch (error) {
      if (error instanceof Error) throw error;

      throw new Error('Internal server error');
    }
  }

  async updateProfile(
    id: string,
    data: UpdateProfileDto,
    avatar?: FileUploadInput,
  ) {
    try {
      const payload: UpdateProfileDto & { avatarUrl?: string } = { ...data };
      if (avatar) {
        payload.avatarUrl = await this.avatars.storeAvatar(avatar);
      }
      return await this.usersService.updateUser(id, payload);
    } catch (error) {
      if (error instanceof Error) throw error;

      throw new Error('Internal server error');
    }
  }
}
