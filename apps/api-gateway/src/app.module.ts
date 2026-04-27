import { Module } from '@nestjs/common';
import { GatewayProxyService } from './gateway-proxy.service';
import { HealthController } from './health.controller';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [GatewayProxyService],
})
export class AppModule {}
