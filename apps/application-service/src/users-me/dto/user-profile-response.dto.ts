import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ nullable: true, description: 'Display name' })
  fullName!: string | null;

  @ApiProperty({ nullable: true, format: 'uuid', description: 'Stored avatar file id' })
  avatarFileId!: string | null;

  @ApiProperty({ nullable: true, description: 'Public avatar URL' })
  avatarUrl!: string | null;

  @ApiProperty({ nullable: true, description: 'Verified email from auth-service' })
  email!: string | null;

  @ApiProperty({ nullable: true, description: 'Verified/registered phone from auth-service' })
  phone!: string | null;

  @ApiProperty({ description: 'True when email is verified' })
  emailVerified!: boolean;

  @ApiProperty({ description: 'True when phone is verified' })
  phoneVerified!: boolean;

  @ApiProperty({
    nullable: true,
    format: 'date-time',
    description: 'Set when required onboarding steps are complete',
  })
  onboardingCompletedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({
    description:
      'Profile completion percent from onboarding answers (PUT /onboarding/answers): answered steps / total steps in the active flow, 0-100',
    example: 33,
    minimum: 0,
    maximum: 100,
  })
  profileCompletePercent!: number;

  @ApiPropertyOptional({
    description:
      'Present when a profile update started email/phone verification and the client should ask for OTP.',
  })
  pendingVerification?: Record<string, unknown>;
}
