import { IsOptional, IsString } from 'class-validator';

export class PatchProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;
}
