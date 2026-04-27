import { Module } from '@nestjs/common';
import { ScansModule } from '../scans/scans.module';
import { InternalScansController } from './internal-scans.controller';
import { IngestionInternalApiKeyGuard } from './internal-api-key.guard';

@Module({
  imports: [ScansModule],
  controllers: [InternalScansController],
  providers: [IngestionInternalApiKeyGuard],
})
export class InternalModule {}
