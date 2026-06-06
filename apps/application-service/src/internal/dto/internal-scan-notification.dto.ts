import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum InternalScanNotificationType {
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export class InternalScanNotificationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  scanId!: string;

  @ApiProperty({ enum: InternalScanNotificationType })
  @IsEnum(InternalScanNotificationType)
  type!: InternalScanNotificationType;

  @ApiPropertyOptional({
    description: 'Failure reason for failed scan notifications',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}
