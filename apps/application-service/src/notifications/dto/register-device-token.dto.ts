import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum DevicePlatformDto {
  ANDROID = 'android',
  IOS = 'ios',
  WEB = 'web',
}

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'Stable app-generated device id for this install/session',
    example: 'pixel-8-pro-install-uuid',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  deviceId!: string;

  @ApiProperty({
    description: 'Firebase Cloud Messaging registration token from Flutter',
    example: 'fcm-registration-token',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  fcmToken!: string;

  @ApiProperty({
    description: 'Client platform',
    enum: DevicePlatformDto,
    example: DevicePlatformDto.ANDROID,
  })
  @IsEnum(DevicePlatformDto)
  platform!: DevicePlatformDto;

  @ApiPropertyOptional({
    description: 'Optional device label for debugging/admin tools',
    example: 'Anik Pixel 8',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;
}
