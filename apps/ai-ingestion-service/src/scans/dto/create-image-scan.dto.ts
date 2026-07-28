import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateImageScanDto {
  @ApiPropertyOptional({
    description: 'Restaurant name when scan started from the Restaurant tab',
    example: 'The Green Bowl',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  restaurantName?: string;

  @ApiPropertyOptional({
    description: 'Google Places place id',
    example: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  restaurantPlaceId?: string;

  @ApiPropertyOptional({
    description: 'Restaurant formatted address',
    example: '123 Main St, Austin, TX',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  restaurantAddress?: string;
}
