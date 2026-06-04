import { Module } from '@nestjs/common';
import { ScansModule } from '../scans/scans.module';
import { InternalScansController } from './internal-scans.controller';
import { IngestionInternalApiKeyGuard } from './internal-api-key.guard';
import { InternalUsersController } from './internal-users.controller';

@Module({
  imports: [ScansModule],
  controllers: [InternalScansController, InternalUsersController],
  providers: [IngestionInternalApiKeyGuard],
})
export class InternalModule {}
