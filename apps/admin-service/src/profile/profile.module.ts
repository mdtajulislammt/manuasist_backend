import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UsersService } from '../users/users.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, UsersService]
})
export class ProfileModule { }
