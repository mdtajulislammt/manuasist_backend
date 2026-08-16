import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class LaunchContentAssetOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex!: number;
}

export class ReorderLaunchContentAssetsDto {
  @ApiProperty({ type: [LaunchContentAssetOrderDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LaunchContentAssetOrderDto)
  assets!: LaunchContentAssetOrderDto[];
}
