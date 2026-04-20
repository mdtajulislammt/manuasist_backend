// @ts-ignore
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class OtpRequestDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsIn(['SIGNUP', 'PASSWORD_RESET'])
  type!: 'SIGNUP' | 'PASSWORD_RESET';
}
