import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Personal Pronunciation Coach API is running';
  }
}
