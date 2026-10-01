import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '@menu-assist/api-auth';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { ReferralsService } from '../referrals/referrals.service';
import { InternalReferralVerifiedDto } from './dto/internal-referral-verified.dto';

@Controller('internal/referrals')
@ApiTags('Internal — referrals')
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Post('verified')
  @ApiOperation({
    summary: 'Apply earned rewards and emit a live referral update',
  })
  @ApiOkResponse({ description: 'Referral summary recalculated.' })
  async referralVerified(@Body() dto: InternalReferralVerifiedDto) {
    return this.referrals.handleVerifiedReferral(
      dto.referrerId,
      dto.referredUserId,
    );
  }
}
