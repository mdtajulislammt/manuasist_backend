import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from '../internal-api-key.guard';
import { InternalUsersController } from './internal-users.controller';
import { InternalUsersService } from './internal-users.service';

@Module({
  controllers: [InternalUsersController],
  providers: [InternalUsersService, InternalApiKeyGuard],
  exports: [InternalUsersService],
})
export class InternalModule {}
