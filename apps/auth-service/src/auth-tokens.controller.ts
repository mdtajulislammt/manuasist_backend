import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { RefreshTokenService } from './refresh-token.service';

class RefreshBodyDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

@Controller('auth')
export class AuthTokensController {
  constructor(private readonly refreshTokens: RefreshTokenService) {}

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshBodyDto) {
    return this.refreshTokens.rotate(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: RefreshBodyDto) {
    await this.refreshTokens.revoke(body.refreshToken);
  }
}
