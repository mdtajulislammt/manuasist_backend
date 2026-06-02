import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ContactChangeRequestDto {
  @ApiProperty({
    description: 'Contact field to change',
    enum: ['email', 'phone'],
    example: 'email',
  })
  @IsString()
  @IsIn(['email', 'phone'])
  kind!: 'email' | 'phone';

  @ApiProperty({
    description: 'New email address or E.164 phone number',
    example: 'new@example.com',
  })
  @IsString()
  @IsNotEmpty()
  identifier!: string;
}
