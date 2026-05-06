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

export class ReplaceOnboardingIconQueryDto {
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
      'If `true` or `1`, clears the admin label (`iconName` in meta). Do not send a non-empty `iconName` query at the same time.',
    example: false,
  })
  @IsOptional()
  @TransformQueryOptionalTruthyBoolean()
  @IsBoolean()
  clearIconName?: boolean;

  @ApiPropertyOptional({
    description:
      'When set, updates the **admin-assigned label** in meta only (not the `:filename` path param). Omit to leave the previous label unchanged.',
    example: 'spice_hot',
  })
  @IsOptional()
  @TransformQueryFirstStringTrim()
  @Validate(IconNameExclusiveWithClearConstraint)
  @ValidateIf((o: ReplaceOnboardingIconQueryDto) => o.iconName !== undefined)
  @IsString()
  @MaxLength(128)
  @Matches(/^[\w.-]+$/, {
    message:
      'iconName may only contain letters, digits, underscore, hyphen, and dot',
  })
  iconName?: string;
}
