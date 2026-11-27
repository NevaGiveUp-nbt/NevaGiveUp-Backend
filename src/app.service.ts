import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) { }
  getHello(): string {
    return 'Hello World!';
  }

  async getReady(): Promise<{ status: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'Ready to work' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable')
    }
  }

  
}
