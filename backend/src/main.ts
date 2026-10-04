import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true -> giữ body gốc để kiểm tra chữ ký webhook Messenger/Zalo
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' });
  // Tự kiểm tra DTO, loại bỏ field lạ, chuyển kiểu (string -> number...)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  // Tài liệu API tự sinh: http://localhost:4000/docs
  const swagger = new DocumentBuilder().setTitle('AI CRM API').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`🚀 API: http://localhost:${port}  ·  Swagger: http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap();
