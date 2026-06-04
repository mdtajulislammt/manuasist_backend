import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../decorators/current-user-id.decorator';
import { GetHomeQueryDto } from './dto/get-home-query.dto';
import { HomeService } from './home.service';

@Controller('home')
@ApiTags('Home')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token' })
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  @ApiOperation({ summary: 'Get screen-ready home dashboard data' })
  @ApiOkResponse({ description: 'Home screen data returned.' })
  getHome(
    @CurrentUserId() userId: string | undefined,
    @Query() query: GetHomeQueryDto,
  ) {
    if (!userId) {
      throw new UnauthorizedException('User id missing from token');
    }
    return this.home.getHome(userId, query);
  }
}
