// @ts-ignore
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// @ts-ignore
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SocialLoginDto {
  @ApiProperty({
    description: 'Social identity provider',
    enum: ['google', 'apple'],
    example: 'google',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'apple'])
  provider!: 'google' | 'apple';

  @ApiProperty({
    description:
      'Raw id_token received from the native Google or Apple SDK. ' +
      'For Google this is the credential from google.accounts.id.initialize. ' +
      'For Apple this is the identityToken from ASAuthorizationAppleIDCredential.',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
  })
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @ApiPropertyOptional({
    description:
      'Optional referral code. If provided, the newly created social account will be linked to the referrer.',
    example: 'MENU-A1B2C3D4',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  referralCode?: string;
}
