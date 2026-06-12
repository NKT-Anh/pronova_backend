import { Injectable } from '@nestjs/common';
import { PrismaService } from './core/prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Personal Pronunciation Coach API is running';
  }

  async health() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      success: true,
      message: 'Server is running',
      data: {
        status: 'ok',
        database: 'connected',
      },
    };
  }
}
