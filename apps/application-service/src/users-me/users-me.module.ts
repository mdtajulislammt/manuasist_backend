import { Module } from '@nestjs/common';
import { AdminInternalModule } from '../admin-internal/admin-internal.module';
import { AuthInternalModule } from '../auth-internal/auth-internal.module';
import { UsersMeController } from './users-me.controller';
import { UsersMeService } from './users-me.service';

@Module({
  imports: [AdminInternalModule, AuthInternalModule],
  controllers: [UsersMeController],
  providers: [UsersMeService],
  exports: [UsersMeService],
})
export class UsersMeModule {}
