import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
@ApiTags('Referrals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) { }

  @Get('me')
  @ApiOperation({ summary: 'Get current user referral code and rewards' })
  @ApiOkResponse({ description: 'Referral screen data returned.' })
  getMe(@CurrentUserId() userId: string | undefined) {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return this.referrals.getMyReferrals(userId);
  }
}
