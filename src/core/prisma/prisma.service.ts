import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    let databaseUrl = configService.getOrThrow<string>('DATABASE_URL');

    // 1. Solve interpolation for ${DB_PASSWORD} if not already resolved
    if (databaseUrl.includes('${DB_PASSWORD}')) {
      const dbPassword = configService.get<string>('DB_PASSWORD') || '';
      databaseUrl = databaseUrl.replace('${DB_PASSWORD}', dbPassword);
    }

    // 2. Automatically switch host 'postgres' to 'localhost' when running on the host machine (outside Docker)
    const isDocker = fs.existsSync('/.dockerenv');
    if (!isDocker && databaseUrl.includes('@postgres:5432')) {
      databaseUrl = databaseUrl.replace('@postgres:5432', '@localhost:5432');
    }

    super({
      adapter: new PrismaPg(databaseUrl),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
