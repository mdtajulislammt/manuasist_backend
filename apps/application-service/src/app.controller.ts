import { Public } from '@menu-assist/api-auth';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@Public()
@Controller()
@ApiTags('Root')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Service greeting' })
  @ApiOkResponse({
    description: 'Plain text greeting',
    schema: { type: 'string', example: 'Hello World!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
