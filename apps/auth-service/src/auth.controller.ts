import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiHeader,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '@menu-assist/api-auth';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshBodyDto } from './dto/refresh-body.dto';
import { LoginDto } from './dto/login.dto';
// @ts-ignore
import { OtpRequestDto } from './dto/otp-request.dto';
// @ts-ignore
import { OtpVerifyDto } from './dto/otp-verify.dto';
// @ts-ignore
import { UpdatePasswordDto } from './dto/update-password.dto';
import { InternalApiKeyGuard } from './internal-api-key.guard';

function bearerTokenFromAuthorization(header: string | undefined): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedException('Missing bearer token');
  }
  return header.slice(7);
}

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

@Controller('')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly auth: AuthService) { }

  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Register user with identifier and password' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'User registered. Returns pending OTP verification state.',
  })
  @ApiBadRequestResponse({ description: 'Invalid input or identifier format.' })
  register(@Body() body: RegisterDto) {
    return this.auth.registerWithPassword({
      identifier: body.identifier,
      password: body.password,
      confirmPassword: body.confirmPassword,
    });
  }

  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request OTP for signup or password reset' })
  @ApiBody({ type: OtpRequestDto })
  @ApiOkResponse({ description: 'OTP generated and dispatched.' })
  @ApiBadRequestResponse({ description: 'Invalid identifier or OTP type.' })
  otpRequest(@Body() body: OtpRequestDto) {
    return this.auth.requestOtp({
      identifier: body.identifier,
      type: body.type,
    });
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify OTP for signup or password reset' })
  @ApiBody({ type: OtpVerifyDto })
  @ApiOkResponse({
    description:
      'Returns token pair for signup verification, or success status for password reset.',
  })
  @ApiBadRequestResponse({ description: 'Invalid OTP payload.' })
  @ApiUnauthorizedResponse({ description: 'OTP invalid, expired, or exceeded attempts.' })
  otpVerify(@Body() body: OtpVerifyDto) {
    return this.auth.verifyOtp({
      identifier: body.identifier,
      type: body.type,
      otp: body.otp,
      newPassword: body.newPassword,
      confirmPassword: body.confirmPassword,
    });
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with identifier and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Authenticated successfully. Returns token pair.' })
  @ApiBadRequestResponse({ description: 'Invalid input payload.' })
  @ApiUnauthorizedResponse({ description: 'Credentials invalid or identifier not verified.' })
  login(@Body() body: LoginDto) {
    return this.auth.login({
      identifier: body.identifier,
      password: body.password,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token and issue new token pair' })
  @ApiBody({ type: RefreshBodyDto })
  @ApiOkResponse({ description: 'Refresh successful. Returns new token pair.' })
  @ApiUnauthorizedResponse({ description: 'Refresh token invalid, expired, or reused.' })
  async refresh(@Body() body: RefreshBodyDto) {
    return this.auth.rotate(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke refresh token family (logout)' })
  @ApiBody({ type: RefreshBodyDto })
  @ApiNoContentResponse({ description: 'Logout successful.' })
  async logout(@Body() body: RefreshBodyDto) {
    await this.auth.revoke(body.refreshToken);
  }

  @Patch('password')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password while authenticated',
    description:
      'Requires a valid access token. Verifies current password, sets a new hash, and revokes all refresh tokens (other sessions must sign in again).',
  })
  @ApiBody({ type: UpdatePasswordDto })
  @ApiOkResponse({
    description: 'Password updated.',
    schema: {
      type: 'object',
      properties: { status: { type: 'string', example: 'PASSWORD_UPDATED' } },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error, passwords mismatch, or account has no password.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid token or wrong current password.',
  })
  async updatePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdatePasswordDto,
  ) {
    const token = bearerTokenFromAuthorization(authorization);
    const { sub } = await this.auth.verifyAccessToken(token);
    return this.auth.updatePasswordForUser(sub, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      confirmPassword: body.confirmPassword,
    });
  }
}

@Controller('oauth')
@ApiTags('OAuth')
export class OAuthController {
  constructor(private readonly auth: AuthService) { }

  @Get('authorize')
  @ApiOperation({ summary: 'Start OAuth authorization redirect flow' })
  @ApiOkResponse({ description: 'Redirect response to identity provider.' })
  async authorize(@Res() res: Response) {
    const href = await this.auth.buildAuthorizationRedirect();
    return res.redirect(302, href);
  }

  @Get('callback')
  @ApiOperation({ summary: 'OAuth callback endpoint' })
  @ApiOkResponse({ description: 'OAuth callback success. Returns token pair.' })
  @ApiBadRequestResponse({ description: 'OAuth callback contains error or invalid state.' })
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
@ApiTags('Well-Known')
export class WellKnownController {
  constructor(private readonly auth: AuthService) { }

  @Get('jwks.json')
  @ApiOperation({ summary: 'Return JWKS for JWT verification' })
  @ApiOkResponse({ description: 'JWKS document returned.' })
  jwks() {
    return this.auth.getJwks();
  }
}

@Controller('internal/auth')
@ApiTags('Internal Auth')
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiHeader({
  name: 'x-internal-api-key',
  required: true,
})
export class InternalAuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('users/:userId/contact')
  @ApiOperation({ summary: 'Get auth contact/verification by user id (internal)' })
  @ApiOkResponse({ description: 'Contact payload returned.' })
  @ApiUnauthorizedResponse({ description: 'Invalid internal API key or user not found.' })
  getUserContact(@Param('userId') userId: string) {
    return this.auth.getUserContactById(userId);
  }
}
