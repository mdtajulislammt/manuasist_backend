import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from '@api-auth/global-exception.filter';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RMQ_APPLICATION_QUEUE } from '@messaging/constants';
import { createRmqMicroserviceOptions } from '@messaging/rmq-transport.options';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: createRmqMicroserviceOptions(RMQ_APPLICATION_QUEUE),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Menu Assist Application Service')
    .setDescription(
      'Profile under /users/me/profile. Onboarding (active flow, preferences, step answers) under /onboarding/*. Protected routes expect a Bearer JWT. Via the gateway, paths are often prefixed (e.g. /v1/app).',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.startAllMicroservices();
  await app.listen(process.env.APPLICATION_SERVICE_PORT ?? 5002);
}

bootstrap();
