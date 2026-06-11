import { Controller, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiBearerAuth, ApiTags, ApiQuery, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@menu-assist/api-auth';

@Controller('users')
@ApiTags('Users')
@Roles('admin')
@ApiBearerAuth('JWT-auth')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @HttpCode(200)
    @ApiOperation({ summary: 'List all users paginated' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
    @ApiQuery({ name: 'sort', required: false, type: String, description: 'Field to sort by (default: createdAt)' })
    @ApiQuery({ name: 'order', required: false, type: String, description: 'Sorting order: asc or desc (default: desc)' })
    @ApiOkResponse({ description: 'Paginated user list returned successfully.' })
    async getUsers(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('sort') sort?: string,
        @Query('order') order?: string,
    ) {
        const pageNum = page ? parseInt(page, 10) : undefined;
        const limitNum = limit ? parseInt(limit, 10) : undefined;
        return this.usersService.getAll(
            pageNum && !isNaN(pageNum) ? pageNum : undefined,
            limitNum && !isNaN(limitNum) ? limitNum : undefined,
            sort,
            order,
        );
    }


    @Get(':id')
    @HttpCode(200)
    @ApiOperation({ summary: 'Get user by ID' })
    @ApiOkResponse({ description: 'User returned successfully.' })
    async getUserById(
        @Param('id') id: string,
    ) {
        return this.usersService.getUserById(id);
    }


    @Patch(':id/status')
    @HttpCode(200)
    @ApiOperation({ summary: 'Toggle user status' })
    @ApiOkResponse({ description: 'User status toggled successfully.' })
    async toggleUserStatus(
        @Param('id') id: string,
    ) {
        return this.usersService.toggleUserStatus(id);
    }
}
