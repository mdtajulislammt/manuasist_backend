import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
    constructor(private readonly usersService: UsersService) { }

    async getProfile(id: string) {
        try {
            return await this.usersService.getUserById(id)
        } catch (error) {
            if (error instanceof Error) throw error;

            throw new Error('Internal server error');
        }
    }

    async updateProfile(id: string, data: UpdateProfileDto) {
        try {
            return await this.usersService.updateUser(id, data)
        } catch (error) {
            if (error instanceof Error) throw error;

            throw new Error('Internal server error');
        }
    }
}
