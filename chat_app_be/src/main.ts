import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ limit: '8mb', extended: true }));

  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  // Bind all interfaces so other Docker containers can reach the API (not only 127.0.0.1).
  await app.listen(port, '0.0.0.0');
}
bootstrap();
