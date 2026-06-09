// @ts-ignore
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// @ts-ignore
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class OAuthAuthorizeDto {
  @ApiProperty({
    description: 'Social identity provider to redirect to',
    enum: ['google', 'apple'],
    example: 'google',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'apple'])
  provider!: 'google' | 'apple';

  @ApiPropertyOptional({
    description:
      'Optional referral code. Encoded in the OAuth state param and applied if this is a new account.',
    example: 'MENU-A1B2C3D4',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  referralCode?: string;
}
