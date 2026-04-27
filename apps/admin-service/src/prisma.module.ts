import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PrismaService,
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('ADMIN_DATABASE_URL');
        return new PrismaService(url);
      },
      inject: [ConfigService],
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
