import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { IconNameExclusiveWithClearConstraint } from './icon-name-clear-exclusive.constraint';
import {
  TransformQueryFirstStringTrim,
  TransformQueryOptionalTruthyBoolean,
} from './icon-query.transforms';

/** Optional multipart text fields for replace. Body values override query. */
export class ReplaceOnboardingIconBodyDto {
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
      'If `true` / `1` / `yes`, clears the admin label. Do not send a non-empty `iconName` field at the same time.',
    example: false,
  })
  @IsOptional()
  @TransformQueryOptionalTruthyBoolean()
  @IsBoolean()
  clearIconName?: boolean;

  @ApiPropertyOptional({
    description:
      'New admin label (e.g. `Peanuts`). Does not change the `:filename` in the URL. Omit to keep the previous label.',
    example: 'Peanuts',
  })
  @IsOptional()
  @TransformQueryFirstStringTrim()
  @Validate(IconNameExclusiveWithClearConstraint)
  @ValidateIf((o: ReplaceOnboardingIconBodyDto) => o.iconName !== undefined)
  @IsString()
  @MaxLength(128)
  @Matches(/^[\w.-]+$/, {
    message:
      'iconName may only contain letters, digits, underscore, hyphen, and dot',
  })
  iconName?: string;
}
