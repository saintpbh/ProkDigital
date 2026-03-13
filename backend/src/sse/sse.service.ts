import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SseService {
  private events$ = new Subject<any>();
  private connectionCount = 0;

  sendEvent(event: any) {
    const logMsg = `[SSE-SERVER] 📢 ${new Date().toISOString()} | Event: ${event.event} | Token: ${event.token || 'global'} | Data: ${JSON.stringify(event.data)}\n`;
    console.log(logMsg.trim());
    
    // Write to a persistent log file for debugging
    try {
        const logPath = path.join(process.cwd(), 'sse_broadcast.log');
        fs.appendFileSync(logPath, logMsg);
    } catch (e) {
        console.error('Failed to write to SSE log file', e);
    }

    this.events$.next(event);
  }

  getEvents(): Observable<MessageEvent> {
    return this.events$.asObservable().pipe(
      map((data) => ({ data } as MessageEvent)),
    );
  }

  incrementConnections() {
    this.connectionCount++;
    console.log(`[SSE-SERVER] 👤 Connection added. Total: ${this.connectionCount}`);
    this.broadcastCount();
  }

  decrementConnections() {
    this.connectionCount = Math.max(0, this.connectionCount - 1);
    console.log(`[SSE-SERVER] 👤 Connection removed. Total: ${this.connectionCount}`);
    this.broadcastCount();
  }

  getConnectionCount(): number {
    return this.connectionCount;
  }

  private broadcastCount() {
    this.sendEvent({ event: 'connection_count', count: this.connectionCount });
  }
}
