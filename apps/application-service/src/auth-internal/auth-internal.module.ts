import { Module } from '@nestjs/common';
import { AuthInternalClientService } from './auth-internal-client.service';

@Module({
  providers: [AuthInternalClientService],
  exports: [AuthInternalClientService],
})
export class AuthInternalModule {}
