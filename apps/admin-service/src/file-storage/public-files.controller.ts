import { Public } from '@menu-assist/api-auth';
import { BadRequestException, Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { StoredFileNamespace } from '../../generated/prisma/client';
import { FileStorageService } from './file-storage.service';

@Controller('files')
@ApiTags('Platform files')
export class PublicFilesController {
  constructor(private readonly files: FileStorageService) {}

  @Get(':namespace/:storedName')
  @Public()
  @ApiOperation({ summary: 'Stream a stored file by namespace and stored name (public)' })
  @ApiProduces('application/octet-stream', 'image/png', 'image/jpeg', 'image/gif', 'image/webp')
  @ApiOkResponse({ description: 'Binary stream.' })
  async get(
    @Param('namespace') namespaceParam: string,
    @Param('storedName') storedName: string,
  ): Promise<StreamableFile> {
    const namespace = this.parseNamespace(namespaceParam);
    const { stream, contentType } = await this.files.getStream(namespace, storedName);
    return new StreamableFile(stream, {
      type: contentType,
      disposition: `inline; filename="${storedName}"`,
    });
  }

  private parseNamespace(value: string): StoredFileNamespace {
    const upper = value.toUpperCase().replace(/-/g, '_');
    if (Object.values(StoredFileNamespace).includes(upper as StoredFileNamespace)) {
      return upper as StoredFileNamespace;
    }
    throw new BadRequestException(`Unknown file namespace: ${value}`);
  }
}
