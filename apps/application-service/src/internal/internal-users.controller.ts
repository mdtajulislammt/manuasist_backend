import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
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

  @Get(':userId/dietary-context')
  @ApiOperation({ summary: 'Get user preferences and onboarding answers for AI pipeline' })
  @ApiOkResponse({ description: 'Dietary context returned.' })
  getDietaryContext(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.users.getDietaryContext(userId);
  }
}
