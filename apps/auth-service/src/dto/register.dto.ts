// @ts-ignore
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  // @ts-ignore
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword!: string;
}
