import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PatchProfileDto {
  @ApiPropertyOptional({ description: 'Display name', example: 'Alex Doe' })
  @IsOptional()
  @IsString()
  fullName?: string;
}
