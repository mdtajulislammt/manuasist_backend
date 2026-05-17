import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { PatternsService } from './patterns.service';

@Controller('patterns')
@ApiTags('Diet patterns')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class PatternsController {
  constructor(private readonly patterns: PatternsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get aggregated diet patterns from scan history' })
  @ApiOkResponse({ description: 'Patterns returned' })
  me(@CurrentUserId() userId: string | undefined) {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return this.patterns.getPatternsForUser(userId);
  }
}
