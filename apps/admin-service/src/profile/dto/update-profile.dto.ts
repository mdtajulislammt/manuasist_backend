import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';

export class UpdateProfileDto {

    @ApiProperty({
        description: 'User name',
        example: 'John Doe',
    })
    @IsOptional()
    @IsString()
    fullName?: string;

    @ApiPropertyOptional({
        description: 'User email',
        example: 'john@example.com',
    })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({
        description: 'User phone number',
        example: '+1234567890',
    })
    @IsOptional()
    @IsString()
    @MinLength(10, { message: 'Phone number must be at least 10 digits' })
    phone?: string;

    @ApiPropertyOptional({
        description: 'User address',
        example: '123 Main St, Anytown, USA',
    })
    @IsOptional()
    @IsString()
    address?: string;
}
