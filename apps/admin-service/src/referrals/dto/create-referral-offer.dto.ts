import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateReferralOfferDto {
  @ApiProperty({ example: 'Default Referral Offer' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional base URL for generated share links',
    example: 'https://menu-assist.anikstudio.com',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  shareBaseUrl?: string;
}
