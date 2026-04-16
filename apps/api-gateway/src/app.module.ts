import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayProxyService } from './gateway-proxy.service';
import { HealthController } from './health.controller';

@Module({
  imports: [],
  controllers: [HealthController, GatewayController],
  providers: [GatewayProxyService],
})
export class AppModule {}
