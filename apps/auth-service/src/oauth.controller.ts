import {
  BadRequestException,
  Controller,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OidcService } from './oidc.service';

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

@Controller('oauth')
export class OAuthController {
  constructor(private readonly oidc: OidcService) { }

  @Get('authorize')
  async authorize(@Res() res: Response) {
    const href = await this.oidc.buildAuthorizationRedirect();
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
    const body = await this.oidc.handleCallback(url);
    return res.status(200).json(body);
  }
}
