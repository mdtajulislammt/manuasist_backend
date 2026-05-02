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

export class UploadOnboardingIconQueryDto {
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
      'Optional **admin-assigned label** for this icon (not the stored UUID filename, not the upload file name). Letters, digits, `_`, `-`, `.`; max 128. Saved in `{stored-filename}.meta.json`; returned on list/upload.',
    example: 'Peanuts',
  })
  @IsOptional()
  @TransformQueryFirstStringTrim()
  @ValidateIf((o: UploadOnboardingIconQueryDto) => o.iconName !== undefined)
  @IsString()
  @MaxLength(128)
  @Matches(/^[\w.-]+$/, {
    message:
      'iconName may only contain letters, digits, underscore, hyphen, and dot',
  })
  iconName?: string;
}
