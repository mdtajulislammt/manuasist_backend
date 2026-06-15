import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '@menu-assist/api-auth';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { InternalUsersService } from './internal-users.service';

@Controller('internal/users')
@ApiTags('Internal — users')
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalUsersController {
  constructor(private readonly users: InternalUsersService) { }

  @Get('profiles/search')
  @ApiOperation({ summary: 'Search user profiles (internal)' })
  @ApiOkResponse({ description: 'User profiles matching search term returned.' })
  searchUserProfiles(@Query('q') q: string) {
    return this.users.searchUserProfiles(q || '');
  }

  @Post('profiles/batch')
  @ApiOperation({ summary: 'Get user profiles by batch of userIds (internal)' })
  @ApiOkResponse({ description: 'User profiles returned.' })
  getProfilesByUserIds(@Body('userIds') userIds: string[]) {
    return this.users.getProfilesByUserIds(userIds || []);
  }

  @Get(':userId/profile')
  @ApiOperation({ summary: 'Get user profile by userId (internal)' })
  @ApiOkResponse({ description: 'User profile returned.' })
  getUserProfile(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.getUserProfile(userId);
  }

  @Get(':userId/dietary-context')
  @ApiOperation({ summary: 'Get user preferences and onboarding answers for AI pipeline' })
  @ApiOkResponse({ description: 'Dietary context returned.' })
  getDietaryContext(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.getDietaryContext(userId);
  }

  @Get(':userId/scan-access')
  @ApiOperation({ summary: 'Check whether a user can create a menu scan' })
  @ApiOkResponse({ description: 'Scan access returned.' })
  getScanAccess(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.assertCanCreateScan(userId);
  }

  @Post(':userId/scan-credit/consume')
  @ApiOperation({ summary: 'Consume a free scan credit for non-premium users' })
  @ApiOkResponse({ description: 'Credit consumed or skipped for premium user.' })
  consumeScanCredit(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.consumeScanCredit(userId);
  }

  @Get(':userId/premium-access')
  @ApiOperation({ summary: 'Check whether a user has premium access' })
  @ApiOkResponse({ description: 'Premium access returned.' })
  getPremiumAccess(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.assertPremiumAccess(userId);
  }
}
