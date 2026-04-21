import { ApiProperty } from '@nestjs/swagger';

export class HealthOkResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'application-service' })
  service!: string;
}

export class ReadyOkResponseDto {
  @ApiProperty({ example: 'ready' })
  status!: string;

  @ApiProperty({ example: 'application-service' })
  service!: string;
}
