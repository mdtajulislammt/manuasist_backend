import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateLaunchContentDto {
  @ApiProperty({ example: 'Default launch experience' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name!: string;
}
