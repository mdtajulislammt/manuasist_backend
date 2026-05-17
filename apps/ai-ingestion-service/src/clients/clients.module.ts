import { Module } from '@nestjs/common';
import { AdminFileClientService } from './admin-file-client.service';
import { ApplicationClientService } from './application-client.service';

@Module({
  providers: [ApplicationClientService, AdminFileClientService],
  exports: [ApplicationClientService, AdminFileClientService],
})
export class ClientsModule {}
