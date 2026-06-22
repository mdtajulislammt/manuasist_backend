// @ts-ignore
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// @ts-ignore
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Email or E.164 phone number',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({
    description: 'Account password',
    minLength: 8,
    maxLength: 128,
    example: 'User@123456',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    description: 'Must match password',
    minLength: 8,
    maxLength: 128,
    example: 'User@123456',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword!: string;

  @ApiPropertyOptional({
    description:
      'Optional referral code from another user. If provided, this user will be marked as referred by the code owner.',
    example: 'a1b2c3d4e5f6',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  // @Matches(/^MENU-/, { message: 'referralCode must start with MENU-' })
  @MaxLength(64)
  referralCode?: string;
}
