import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }

  @Get('ready')
  ready() {
    return { status: 'ready', service: 'api-gateway' };
  }
}
