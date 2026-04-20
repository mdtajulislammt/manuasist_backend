import { Controller, Get } from '@nestjs/common';
import { AdminInternalClientService } from '../admin-internal/admin-internal-client.service';

@Controller('onboarding')
export class ApplicationOnboardingController {
  constructor(private readonly admin: AdminInternalClientService) {}

  @Get('active-flow')
  getActiveFlow() {
    return this.admin.getActiveFlow();
  }
}
