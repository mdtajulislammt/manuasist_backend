import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshBodyDto } from './dto/refresh-body.dto';
import { LoginDto } from './dto/login.dto';

function callbackUrlFromRequest(req: Request): URL {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof forwardedProto === 'string'
      ? forwardedProto.split(',')[0]?.trim()
      : undefined;
  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    typeof forwardedHost === 'string'
      ? forwardedHost.split(',')[0]?.trim()
      : req.headers.host;
  const base = `${proto ?? req.protocol}://${host ?? 'localhost'}`;
  const path = req.originalUrl ?? req.url;
  return new URL(path, base);
}

// --- Controllers (single module file; Nest requires one @Controller per class) ---

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) { }

  @Post('register')
  @HttpCode(201)
  register(@Body() body: RegisterDto) {
    return this.auth.registerWithPassword({
      identifier: body.identifier,
      password: body.password,
      confirmPassword: body.confirmPassword,
    });
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto) {
    return this.auth.login({
      identifier: body.identifier,
      password: body.password,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshBodyDto) {
    return this.auth.rotate(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: RefreshBodyDto) {
    await this.auth.revoke(body.refreshToken);
  }
}

@Controller('oauth')
export class OAuthController {
  constructor(private readonly auth: AuthService) { }

  @Get('authorize')
  async authorize(@Res() res: Response) {
    const href = await this.auth.buildAuthorizationRedirect();
    return res.redirect(302, href);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const err = req.query['error'];
    if (typeof err === 'string') {
      const desc = req.query['error_description'];
      throw new BadRequestException(
        typeof desc === 'string' ? `${err}: ${desc}` : err,
      );
    }
    const url = callbackUrlFromRequest(req);
    const body = await this.auth.handleCallback(url);
    return res.status(200).json(body);
  }
}

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly auth: AuthService) { }

  @Get('jwks.json')
  jwks() {
    return this.auth.getJwks();
  }
}
