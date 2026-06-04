import { Public, Roles } from '@menu-assist/api-auth';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { CreateReferralOfferDto } from './dto/create-referral-offer.dto';
import { CreateReferralTierDto } from './dto/create-referral-tier.dto';
import { UpdateReferralOfferDto } from './dto/update-referral-offer.dto';
import { UpdateReferralTierDto } from './dto/update-referral-tier.dto';
import { ReferralsService } from './referrals.service';

@Controller('referrals/offers')
@ApiTags('Admin Referral Offers')
@ApiBearerAuth()
@Roles('admin')
export class ReferralOffersController {
  constructor(private readonly referrals: ReferralsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a draft referral offer' })
  @ApiBody({ type: CreateReferralOfferDto })
  @ApiOkResponse({ description: 'Referral offer created.' })
  createOffer(@Body() dto: CreateReferralOfferDto) {
    return this.referrals.createOffer(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List referral offers and tiers' })
  @ApiOkResponse({ description: 'Referral offers returned.' })
  listOffers() {
    return this.referrals.listOffers();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get referral offer by id' })
  @ApiOkResponse({ description: 'Referral offer returned.' })
  getOffer(@Param('id', ParseUUIDPipe) id: string) {
    return this.referrals.getOffer(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update draft referral offer metadata' })
  @ApiBody({ type: UpdateReferralOfferDto })
  @ApiOkResponse({ description: 'Referral offer updated.' })
  updateOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReferralOfferDto,
  ) {
    return this.referrals.updateOffer(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a referral offer' })
  @ApiOkResponse({ description: 'Referral offer archived.' })
  deleteOffer(@Param('id', ParseUUIDPipe) id: string) {
    return this.referrals.deleteOffer(id);
  }

  @Post(':id/tiers')
  @ApiOperation({ summary: 'Add a reward tier to a draft referral offer' })
  @ApiBody({ type: CreateReferralTierDto })
  @ApiOkResponse({ description: 'Referral reward tier created.' })
  addTier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReferralTierDto,
  ) {
    return this.referrals.addTier(id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a referral offer and make it active' })
  @ApiOkResponse({ description: 'Referral offer published.' })
  publishOffer(@Param('id', ParseUUIDPipe) id: string) {
    return this.referrals.publishOffer(id);
  }
}

@Controller('referrals/tiers')
@ApiTags('Admin Referral Reward Tiers')
@ApiBearerAuth()
@Roles('admin')
export class ReferralTiersController {
  constructor(private readonly referrals: ReferralsService) { }

  @Patch(':tierId')
  @ApiOperation({ summary: 'Update a reward tier on a draft referral offer' })
  @ApiBody({ type: UpdateReferralTierDto })
  @ApiOkResponse({ description: 'Referral reward tier updated.' })
  updateTier(
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body() dto: UpdateReferralTierDto,
  ) {
    return this.referrals.updateTier(tierId, dto);
  }

  @Delete(':tierId')
  @ApiOperation({ summary: 'Delete a reward tier from a draft referral offer' })
  @ApiOkResponse({ description: 'Referral reward tier deleted.' })
  deleteTier(@Param('tierId', ParseUUIDPipe) tierId: string) {
    return this.referrals.deleteTier(tierId);
  }
}

@Controller('internal/referrals')
@ApiTags('Internal Referrals')
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
export class InternalReferralsController {
  constructor(private readonly referrals: ReferralsService) { }

  @Get('active-offer')
  @ApiOperation({ summary: 'Get active published referral offer' })
  @ApiOkResponse({ description: 'Active referral offer returned.' })
  getActiveOffer() {
    return this.referrals.getActiveOfferForInternal();
  }
}
