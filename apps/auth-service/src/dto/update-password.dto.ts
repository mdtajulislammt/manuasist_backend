// @ts-ignore
import { ApiProperty } from '@nestjs/swagger';
// @ts-ignore
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @ApiProperty({
    description: 'Current account password',
    minLength: 8,
    maxLength: 128,
    example: 'User@123456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({
    description: 'New password',
    minLength: 8,
    maxLength: 128,
    example: 'NewUser@123456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;

  @ApiProperty({
    description: 'Must match newPassword',
    minLength: 8,
    maxLength: 128,
    example: 'NewUser@123456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword!: string;
}
