// @ts-ignore
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  // @ts-ignore
} from 'class-validator';

export class OtpVerifyDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsIn(['SIGNUP', 'PASSWORD_RESET'])
  type!: 'SIGNUP' | 'PASSWORD_RESET';

  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword?: string;
}
