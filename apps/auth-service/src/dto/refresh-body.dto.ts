// @ts-ignore
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshBodyDto {
    @IsString()
    @IsNotEmpty()
    refreshToken!: string;
}
