import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InternalReferralVerifiedDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  referrerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  referredUserId!: string;
}
