import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { createRmqMicroserviceOptions } from '@messaging/rmq-transport.options';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice({
    transport: Transport.RMQ,
    options: createRmqMicroserviceOptions(),
  });
  await app.startAllMicroservices();
  await app.listen(process.env.AI_INGESTION_SERVICE_PORT ?? 5004);
}

bootstrap();
