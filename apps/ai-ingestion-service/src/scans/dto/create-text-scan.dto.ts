import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTextScanDto {
  @ApiProperty({
    description: 'Raw menu text (dev/test only — skips image OCR)',
    example: 'Grilled Salmon — rice and vegetables\nCaesar Salad',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  menuText!: string;
}
