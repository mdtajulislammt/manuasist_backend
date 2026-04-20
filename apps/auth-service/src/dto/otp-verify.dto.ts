// @ts-ignore
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
// @ts-ignore
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class OtpVerifyDto {
  @ApiProperty({
    description: 'Email or E.164 phone number',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({
    description: 'OTP workflow type',
    enum: ['SIGNUP', 'PASSWORD_RESET'],
    example: 'SIGNUP',
  })
  @IsString()
  @IsIn(['SIGNUP', 'PASSWORD_RESET'])
  type!: 'SIGNUP' | 'PASSWORD_RESET';

  @ApiProperty({
    description: 'Six-digit OTP code',
    example: '123456',
    pattern: '^\\d{6}$',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp!: string;

  @ApiPropertyOptional({
    description: 'Required when type is PASSWORD_RESET',
    minLength: 8,
    maxLength: 128,
    example: 'NewPass@123456',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword?: string;

  @ApiPropertyOptional({
    description: 'Must match newPassword when type is PASSWORD_RESET',
    minLength: 8,
    maxLength: 128,
    example: 'NewPass@123456',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword?: string;
}
