import { JwtAuthGuard } from '@api-auth/jwt-auth.guard';
import { Roles } from '@api-auth/roles.decorator';
import { Controller, Get, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { CurrentUserId } from 'apps/ai-ingestion-service/src/decorators/current-user-id.decorator';

@Roles('admin')
@Controller('profile')
export class ProfileController {

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @Get('me')
    @ApiOkResponse({
        description: 'Get current user profile',
    })
    async getCurrentUserProfile(@CurrentUserId() userId: string | undefined) {
        const id = this.requireUserId(userId);
        return {
            id
        }
    }

    private requireUserId(userId: string | undefined): string {
        if (!userId) {
            throw new UnauthorizedException();
        }
        return userId;
    }
}
