import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from '@api-auth/global-exception.filter';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Menu Assist AI Ingestion Service')
    .setDescription(
      'Menu scan ingestion, async processing, and internal ops endpoints.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-internal-api-key', in: 'header' })
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.AI_INGESTION_SERVICE_PORT ?? 5004);
}

bootstrap();
