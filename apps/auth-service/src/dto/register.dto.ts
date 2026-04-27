// @ts-ignore
import { ApiProperty } from '@nestjs/swagger';
// @ts-ignore
import { IsString, IsNotEmpty, MaxLength, MinLength } from 'class-validator';

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
}
