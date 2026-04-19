import { Public } from '@menu-assist/api-auth';
import { Controller, Get } from '@nestjs/common';

@Public()
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'admin-service' };
  }

  @Get('ready')
  ready() {
    return { status: 'ready', service: 'admin-service' };
  }
}
