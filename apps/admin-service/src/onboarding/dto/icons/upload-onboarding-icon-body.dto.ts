import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TransformQueryFirstStringTrim } from './icon-query.transforms';

/** Optional multipart text fields (same rules as query). Body values override query. */
export class UploadOnboardingIconBodyDto {
  @ApiPropertyOptional({
    description: 'If set, step must belong to a DRAFT flow.',
    format: 'uuid',
  })
  @IsOptional()
  @TransformQueryFirstStringTrim()
  @IsUUID()
  stepId?: string;

  @ApiPropertyOptional({
    description:
      'Admin label for this icon (e.g. `Peanuts`). Not the stored UUID filename. Same rules as query `iconName`.',
    example: 'Peanuts',
  })
  @IsOptional()
  @TransformQueryFirstStringTrim()
  @ValidateIf((o: UploadOnboardingIconBodyDto) => o.iconName !== undefined)
  @IsString()
  @MaxLength(128)
  @Matches(/^[\w.-]+$/, {
    message:
      'iconName may only contain letters, digits, underscore, hyphen, and dot',
  })
  iconName?: string;
}
