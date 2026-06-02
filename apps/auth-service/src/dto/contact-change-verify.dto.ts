import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';

export class ContactChangeVerifyDto {
  @ApiProperty({
    description: 'Contact field to verify and update',
    enum: ['email', 'phone'],
    example: 'email',
  })
  @IsString()
  @IsIn(['email', 'phone'])
  kind!: 'email' | 'phone';

  @ApiProperty({
    description: 'New email address or E.164 phone number',
    example: 'new@example.com',
  })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({
    description: 'Six-digit OTP code',
    example: '123456',
    pattern: '^\\d{6}$',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp!: string;
}
