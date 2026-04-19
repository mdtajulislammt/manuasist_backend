import { Controller, Get } from '@nestjs/common';
import { AccessJwtService } from './access-jwt.service'

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly accessJwt: AccessJwtService) { }

  @Get('jwks.json')
  jwks() {
    return this.accessJwt.getJwks();
  }
}
