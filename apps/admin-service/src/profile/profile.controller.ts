import { Roles } from '@api-auth/roles.decorator';
import { Body, Controller, Get, Patch, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import { CurrentUserId } from 'apps/ai-ingestion-service/src/decorators/current-user-id.decorator';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Roles('admin')
@ApiBearerAuth('JWT-auth')
@Controller('profile')
export class ProfileController {
    constructor(private readonly profileService: ProfileService) { }

    @Get('me')
    @ApiOkResponse({
        description: 'Get current user profile',
    })
    async getCurrentUserProfile(@CurrentUserId() userId: string | undefined) {
        const id = this.requireUserId(userId);
        return this.profileService.getProfile(id);
    }

    private requireUserId(userId: string | undefined): string {
        if (!userId) {
            throw new UnauthorizedException();
        }
        return userId;
    }

    @Patch('me/update')
    @ApiResponse({
        description: 'Update Auth User profile.'
    })
    async updateAuthUserProfile(@CurrentUserId() userId: string | undefined, @Body() body: UpdateProfileDto) {
        const id = this.requireUserId(userId);
        return this.profileService.updateProfile(id, body);
    }
}
