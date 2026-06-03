import {
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '@menu-assist/api-auth';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { MembershipService } from './membership.service';

@Controller()
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  @Get('membership/me')
  @ApiTags('Membership')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user membership/subscription state' })
  @ApiOkResponse({ description: 'Membership screen data returned.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
  getMe(@CurrentUserId() userId: string | undefined) {
    return this.membership.getMembership(this.requireUserId(userId));
  }

  @Post('internal/revenuecat/webhook')
  @Public()
  @ApiTags('Internal — RevenueCat')
  @ApiOperation({ summary: 'RevenueCat webhook receiver' })
  @ApiOkResponse({ description: 'RevenueCat event processed.' })
  webhook(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { event?: Record<string, unknown> },
  ) {
    return this.membership.handleRevenueCatWebhook(authorization, body);
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return userId;
  }
}
