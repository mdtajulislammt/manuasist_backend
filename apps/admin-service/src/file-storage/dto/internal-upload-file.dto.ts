import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { StoredFileNamespace } from '../../../generated/prisma/client';

export class InternalUploadFileBodyDto {
  @ApiProperty({ enum: StoredFileNamespace, example: StoredFileNamespace.MENU_SCAN })
  @IsEnum(StoredFileNamespace)
  namespace!: StoredFileNamespace;

  @ApiPropertyOptional({
    description: 'Optional display label (not the stored filename)',
    example: 'menu-photo-1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[\w.-]+$/, {
    message: 'displayName may only contain letters, digits, underscore, hyphen, and dot',
  })
  displayName?: string;
}
