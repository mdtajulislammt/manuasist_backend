import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { MealLogDto } from './dto/meal-log.dto';
import { MealPreviewDto } from './dto/meal-preview.dto';
import { MealsService } from './meals.service';

@Controller('meals')
@ApiTags('Meals')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class MealsController {
  constructor(private readonly meals: MealsService) { }

  @Get('dishes/:dishId/prefill')
  @ApiOperation({ summary: 'Load Add to Today meal screen defaults for a dish' })
  @ApiOkResponse({ description: 'Meal prefill returned' })
  getPrefill(
    @CurrentUserId() userId: string | undefined,
    @Param('dishId', ParseUUIDPipe) dishId: string,
  ) {
    return this.meals.getPrefill(this.requireUserId(userId), dishId);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview scaled nutrition and NAI impact for a meal' })
  @ApiOkResponse({ description: 'Meal preview returned' })
  preview(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: MealPreviewDto,
  ) {
    return this.meals.preview(this.requireUserId(userId), dto);
  }

  @Post('today')
  @ApiOperation({ summary: 'Log a meal for today' })
  @ApiCreatedResponse({ description: 'Meal logged' })
  logToday(
    @CurrentUserId() userId: string | undefined,
    @Body() dto: MealLogDto,
  ) {
    return this.meals.logToday(this.requireUserId(userId), dto);
  }

  @Get('today')
  @ApiOperation({ summary: "Get today's logged meals grouped by meal slot" })
  @ApiOkResponse({ description: "Today's meals returned" })
  getToday(@CurrentUserId() userId: string | undefined) {
    return this.meals.getToday(this.requireUserId(userId));
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return userId;
  }
}
