import { Controller, Get, Query } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@menu-assist/api-auth';
import { SubscriptionListQueryDto } from './dto/subscription-list-query.dto';
import { SubscriptionListService } from './subscription-list.service';

@Controller('subscribers')
@ApiTags('Subscribers')
@ApiBearerAuth('JWT-auth')
@Roles('admin')
export class SubscriptionListController {
    constructor(private readonly subscriptionList: SubscriptionListService) { }

    @Get('stats')
    @ApiOperation({
        summary: 'Get stats for subscription',
    })
    @ApiOkResponse({ description: 'Stats for subscription returned.' })
    stats() {
        return this.subscriptionList.getStats();
    }

    @Get()
    @ApiOperation({
        summary: 'List subscribers with user profile and subscription details',
    })
    @ApiOkResponse({ description: 'Paginated subscription list returned.' })
    list(@Query() query: SubscriptionListQueryDto) {
        return this.subscriptionList.list(query);
    }
}
