import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminInternalClientService } from '../admin-internal/admin-internal-client.service';
import { AdminActiveFlowResponseDto } from './dto/admin-active-flow-response.dto';

@Controller('onboarding')
@ApiTags('Onboarding')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class ApplicationOnboardingController {
  constructor(private readonly admin: AdminInternalClientService) {}

  @Get('active-flow')
  @ApiOperation({
    summary: 'Active published onboarding flow',
    description:
      'Proxies the admin-service internal active flow (steps, version). Use flow.version with PUT /users/me/onboarding/answers.',
  })
  @ApiOkResponse({ type: AdminActiveFlowResponseDto })
  getActiveFlow() {
    return this.admin.getActiveFlow();
  }
}
