import { Public } from '@menu-assist/api-auth';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DishesService } from '../dishes/dishes.service';
import { IngestionInternalApiKeyGuard } from './internal-api-key.guard';

@Controller('internal/dishes')
@ApiTags('Internal — ingestion dishes')
@Public()
@UseGuards(IngestionInternalApiKeyGuard)
@ApiHeader({ name: 'x-internal-api-key', required: true })
@ApiUnauthorizedResponse({ description: 'Invalid or missing internal API key' })
export class InternalDishesController {
  constructor(private readonly dishes: DishesService) {}

  @Get(':dishId/users/:userId')
  @ApiOperation({ summary: 'Get dish payload for Add to Today meal prefill' })
  @ApiOkResponse({ description: 'Dish returned' })
  getDishForMealPrefill(
    @Param('dishId', ParseUUIDPipe) dishId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.dishes.getDishForMealPrefill(userId, dishId);
  }
}
