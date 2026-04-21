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
    .setTitle('Menu Assist Application Service')
    .setDescription(
      'User profile, preferences, and onboarding answers. Protected routes expect a Bearer JWT (same issuer/audience as auth-service). When called via the API gateway, paths are typically prefixed (e.g. /v1/app).',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.APPLICATION_SERVICE_PORT ?? 5002);
}

bootstrap();
