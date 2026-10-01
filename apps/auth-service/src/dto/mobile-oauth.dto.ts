// @ts-ignore
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// @ts-ignore
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MobileOAuthDto {
  @ApiProperty({
    enum: ['google', 'apple'],
    example: 'google',
  })
  @IsIn(['google', 'apple'])
  provider!: 'google' | 'apple';

  @ApiProperty({
    description: 'OIDC ID token from the native Google or Apple SDK',
  })
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @ApiPropertyOptional({
    description:
      'Raw nonce sent to Apple Sign-In (server verifies SHA-256 hash in token)',
  })
  @IsOptional()
  @IsString()
  nonce?: string;

  @ApiPropertyOptional({
    description:
      'Display name from the native SDK (required for Apple on first sign-in)',
    example: 'Jane Doe',
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    description:
      'Avatar URL from the native SDK when the ID token does not include picture',
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
