import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
const axios = require('axios');
import { OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(process.cwd(), 'tunnel_state.json');

@Injectable()
export class TunnelService implements OnModuleInit, OnModuleDestroy {
    private tunnels: Map<number, ChildProcess> = new Map();
    private tunnelUrls: Map<number, string> = new Map();

    async onModuleInit() {
        console.log('Initializing TunnelService...');
        await this.cleanupGhostProcesses();
        this.loadAndRestore();
    }

    private async cleanupGhostProcesses() {
        return new Promise<void>((resolve) => {
            console.log('Cleaning up existing cloudflared processes...');
            if (process.platform === 'win32') {
                const kill = spawn('taskkill', ['/F', '/IM', 'cloudflared.exe', '/T'], { shell: true });
                kill.on('exit', () => {
                    console.log('Taskkill finished.');
                    setTimeout(resolve, 1000); // Give OS a moment to release ports
                });
            } else {
                const kill = spawn('pkill', ['-f', 'cloudflared']);
                kill.on('exit', () => resolve());
            }
        });
    }

    private loadAndRestore() {
        if (fs.existsSync(STATE_FILE)) {
            try {
                const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
                if (state.active) {
                    console.log('Restoring frontend tunnel from previous session...');
                    // ONLY start the frontend tunnel (Port 5173) 
                    // Port 3000 is proxied via Vite /api
                    this.startTunnel(5173).catch(() => {});
                }
            } catch (e) {
                console.error('Failed to load tunnel state', e);
            }
        }
    }

    private saveState(active: boolean) {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ active, timestamp: new Date().toISOString() }));
    }

    async startTunnel(port: number, retryCount = 0): Promise<string> {
        if (this.tunnels.has(port)) {
            const existingUrl = this.tunnelUrls.get(port);
            if (existingUrl) return existingUrl;
        }

        console.log(`Starting Cloudflare tunnel on port ${port} (Attempt ${retryCount + 1})...`);
        
        return new Promise((resolve, reject) => {
            // Use --no-autoupdate and specific binary if possible to speed up
            // Also increase log level slightly for diagnostics
            const tunnelProcess = spawn('npx', [
                '-y', 'cloudflared', 'tunnel', 
                '--no-autoupdate', 
                '--url', `http://localhost:${port}`
            ], {
                shell: true
            });

            let urlFound = false;
            const timer = setTimeout(() => {
                if (!urlFound) {
                    tunnelProcess.kill();
                    console.error(`Tunnel timeout for port ${port}.`);
                    reject(new Error('Cloudflare tunnel timeout'));
                }
            }, 60000); 

            const handleOutput = (data: Buffer) => {
                const output = data.toString();
                const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
                if (match && !urlFound) {
                    urlFound = true;
                    clearTimeout(timer);
                    const url = match[0];
                    this.tunnelUrls.set(port, url);
                    this.tunnels.set(port, tunnelProcess);
                    console.log(`[TUNNEL] Success: Port ${port} -> ${url}`);
                    this.saveState(true);
                    resolve(url);
                }
            };

            tunnelProcess.stdout.on('data', handleOutput);
            tunnelProcess.stderr.on('data', handleOutput);

            tunnelProcess.on('exit', (code) => {
                console.warn(`[TUNNEL] Port ${port} exited with code ${code}.`);
                this.tunnels.delete(port);
                this.tunnelUrls.delete(port);
                
                // Auto-restart if it wasn't a clean stop
                if (code !== 0 && code !== null) {
                    console.log(`[TUNNEL] Unexpected exit. Restarting in 5s...`);
                    setTimeout(() => {
                        this.startTunnel(port, retryCount + 1).catch(err => {
                            console.error(`[TUNNEL] Restart failed for port ${port}:`, err);
                        });
                    }, 5000);
                }
            });

            tunnelProcess.on('error', (err) => {
                console.error(`[TUNNEL] Process error on port ${port}:`, err);
            });
        });
    }

    async stopTunnel(port: number) {
        const process = this.tunnels.get(port);
        if (process) {
            process.kill();
            this.tunnels.delete(port);
            this.tunnelUrls.delete(port);
            if (this.tunnels.size === 0) {
                this.saveState(false);
            }
        }
    }

    getStatus() {
        return Array.from(this.tunnelUrls.entries()).map(([port, url]) => ({
            port,
            url,
            active: true,
        }));
    }

    async getPublicIp(): Promise<string> {
        try {
            const res = await axios.get('https://api.ipify.org?format=json');
            return res.data.ip;
        } catch (err) {
            console.error('Failed to get public IP:', err);
            return 'IP 감지 실패';
        }
    }

    onModuleDestroy() {
        for (const process of this.tunnels.values()) {
            process.kill();
        }
    }
}
