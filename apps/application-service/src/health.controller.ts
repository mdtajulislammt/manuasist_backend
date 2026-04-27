import { Public } from '@menu-assist/api-auth';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthOkResponseDto, ReadyOkResponseDto } from './health-response.dto';

@Public()
@Controller()
@ApiTags('Health')
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: HealthOkResponseDto })
  health() {
    return { status: 'ok', service: 'application-service' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiOkResponse({ type: ReadyOkResponseDto })
  ready() {
    return { status: 'ready', service: 'application-service' };
  }
}
