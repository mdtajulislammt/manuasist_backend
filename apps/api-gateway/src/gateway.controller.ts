import { All, Controller, Req, Res } from '@nestjs/common';
import { GatewayProxyService } from './gateway-proxy.service';

@Controller()
export class GatewayController {
  constructor(private readonly proxy: GatewayProxyService) {}

  @All('v1/auth')
  @All('v1/auth/*path')
  auth(@Req() req: any, @Res() res: any) {
    return this.proxy.proxyTo(req, res, '/v1/auth', 'AUTH_SERVICE_URL');
  }

  @All('v1/app')
  @All('v1/app/*path')
  application(@Req() req: any, @Res() res: any) {
    return this.proxy.proxyTo(req, res, '/v1/app', 'APPLICATION_SERVICE_URL');
  }

  @All('v1/admin')
  @All('v1/admin/*path')
  admin(@Req() req: any, @Res() res: any) {
    return this.proxy.proxyTo(req, res, '/v1/admin', 'ADMIN_SERVICE_URL');
  }

  @All('v1/ingestion')
  @All('v1/ingestion/*path')
  ingestion(@Req() req: any, @Res() res: any) {
    return this.proxy.proxyTo(
      req,
      res,
      '/v1/ingestion',
      'AI_INGESTION_SERVICE_URL',
    );
  }
}
