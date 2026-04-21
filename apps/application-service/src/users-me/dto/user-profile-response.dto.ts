import { ApiProperty } from '@nestjs/swagger';

export class UserProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ nullable: true, description: 'Display name' })
  fullName!: string | null;

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
}
