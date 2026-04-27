import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateScanDto {
  @ApiProperty({
    description:
      'HTTPS URL to a menu image (e.g. presigned object storage URL)',
    example: 'https://cdn.example.com/menus/abc.jpg',
  })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2048)
  imageUrl!: string;
}
