import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PatchProfileDto {
  @ApiPropertyOptional({ description: 'Display name', example: 'Alex Doe' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'New email. Without emailOtp this starts verification.',
    example: 'new@example.com',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'OTP for confirming email change',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  emailOtp?: string;

  @ApiPropertyOptional({
    description: 'New E.164 phone. Without phoneOtp this starts verification.',
    example: '+8801712345678',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'OTP for confirming phone change',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  phoneOtp?: string;
}
