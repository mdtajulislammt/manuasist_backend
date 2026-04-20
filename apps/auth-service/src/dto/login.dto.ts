// @ts-ignore
import {
    IsNotEmpty,
    IsString,
    MaxLength,
    MinLength,
    // @ts-ignore
} from 'class-validator';

export class LoginDto {
    @IsString()
    @IsNotEmpty()
    identifier!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    password!: string;
}