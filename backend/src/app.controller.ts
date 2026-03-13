import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { TunnelService } from './tunnel.service';
import * as os from 'os';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly tunnelService: TunnelService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api/system/ip')
  getIp() {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];
    for (const k in interfaces) {
      if (!interfaces[k]) continue;
      for (const address of interfaces[k]!) {
        if (address.family === 'IPv4' && !address.internal) {
          addresses.push(address.address);
        }
      }
    }
    return { 
      ip: addresses.length > 0 ? addresses[0] : '127.0.0.1',
      all: addresses 
    };
  }

  @Post('api/system/tunnel/start')
  async startTunnel() {
    // Only start the frontend tunnel (Port 5173).
    // Port 3000 is accessible via the frontend tunnel's /api proxy (Vite).
    const frontendUrl = await this.tunnelService.startTunnel(5173);
    const publicIp = await this.tunnelService.getPublicIp();
    return { 
        backendUrl: frontendUrl, // Unified URL
        frontendUrl, 
        publicIp 
    };
  }

  @Post('api/system/tunnel/stop')
  async stopTunnel() {
    await this.tunnelService.stopTunnel(3000);
    await this.tunnelService.stopTunnel(5173);
    return { success: true };
  }

  @Get('api/system/tunnel/status')
  getTunnelStatus() {
    return this.tunnelService.getStatus();
  }
}
