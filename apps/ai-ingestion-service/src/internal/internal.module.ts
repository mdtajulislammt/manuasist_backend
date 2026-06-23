import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { DishesService } from '../dishes/dishes.service';
import { ScansModule } from '../scans/scans.module';
import { InternalBookmarksController } from './internal-bookmarks.controller';
import { InternalDishesController } from './internal-dishes.controller';
import { InternalScansController } from './internal-scans.controller';
import { IngestionInternalApiKeyGuard } from './internal-api-key.guard';
import { InternalUsersController } from './internal-users.controller';

@Module({
  imports: [ClientsModule, ScansModule],
  controllers: [
    InternalScansController,
    InternalUsersController,
    InternalBookmarksController,
    InternalDishesController,
  ],
  providers: [IngestionInternalApiKeyGuard, DishesService],
})
export class InternalModule {}
