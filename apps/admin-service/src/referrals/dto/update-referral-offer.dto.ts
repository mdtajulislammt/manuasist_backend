import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateReferralOfferDto {
  @ApiPropertyOptional({ example: 'Holiday referral offer' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'https://menu-assist.anikstudio.com' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  shareBaseUrl?: string;
}
