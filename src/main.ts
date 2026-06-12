import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { RequestLoggingInterceptor } from './core/interceptors/request-logging.interceptor';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(
    new RequestLoggingInterceptor(),
    new ResponseInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const swaggerEnabled = setupSwagger(app, configService);

  const configuredPort = Number.parseInt(
    String(configService.get('PORT') ?? ''),
    10,
  );

  const port = Number.isNaN(configuredPort) ? 3000 : configuredPort;

  await app.listen(port);

  console.log(`Server running on http://localhost:${port}`);
  if (swaggerEnabled) {
    console.log(`Swagger docs: http://localhost:${port}/api/docs`);
  } else {
    console.log('Swagger docs disabled');
  }
}

function setupSwagger(app: INestApplication, configService: ConfigService) {
  const nodeEnv = configService.get<string>('NODE_ENV') || 'development';
  const docsEnabled =
    configService.get<string>('SWAGGER_ENABLED') ??
    (nodeEnv === 'production' ? 'false' : 'true');

  if (docsEnabled !== 'true') {
    return false;
  }

  const username = configService.get<string>('SWAGGER_USERNAME');
  const password = configService.get<string>('SWAGGER_PASSWORD');

  if (nodeEnv === 'production') {
    if (!username || !password) {
      console.warn(
        'Swagger disabled in production because SWAGGER_USERNAME/SWAGGER_PASSWORD are not set.',
      );
      return false;
    }

    const middleware = createSwaggerBasicAuthMiddleware(username, password);
    app.use('/api/docs', middleware);
    app.use('/api/docs-json', middleware);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Personal Pronunciation Coach API')
    .setDescription('REST API documentation for the pronunciation coach backend.')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'jwt',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-guest-id',
        in: 'header',
        description: 'Guest device id for guest-owned resources',
      },
      'guest-id',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  return true;
}

function createSwaggerBasicAuthMiddleware(username: string, password: string) {
  return (request: Request, response: Response, next: NextFunction) => {
    const authorization = request.header('authorization');
    const expected = `Basic ${Buffer.from(`${username}:${password}`).toString(
      'base64',
    )}`;

    if (authorization === expected) {
      return next();
    }

    response.setHeader('WWW-Authenticate', 'Basic realm="Swagger Docs"');
    throw new UnauthorizedException('Swagger authentication required');
  };
}

bootstrap();
