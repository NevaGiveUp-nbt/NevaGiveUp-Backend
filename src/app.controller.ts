import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './decorator/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('ready')
  async getReady(): Promise<{ status: string }> {
    return this.appService.getReady();
  }

  @Public()
  @Get('health')
  async healthCheck() {
    return {
      message: "ok"
    };
  }

}
