import { Module } from '@nestjs/common';
import { AdminInternalClientService } from './admin-internal-client.service';

@Module({
  providers: [AdminInternalClientService],
  exports: [AdminInternalClientService],
})
export class AdminInternalModule {}
