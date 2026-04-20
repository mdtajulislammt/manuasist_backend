// @ts-ignore
import { ApiProperty } from '@nestjs/swagger';
// @ts-ignore
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshBodyDto {
  @ApiProperty({
    description: 'Refresh token to rotate or revoke',
    example: 'M4M4Q3xJQ9u3...opaque-refresh-token...',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
