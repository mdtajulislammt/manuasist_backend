// @ts-ignore
import { ApiProperty } from '@nestjs/swagger';
// @ts-ignore
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class OtpRequestDto {
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
}
