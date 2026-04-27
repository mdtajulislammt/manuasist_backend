import { ApiProperty } from '@nestjs/swagger';

export class PutOnboardingAnswersResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}
