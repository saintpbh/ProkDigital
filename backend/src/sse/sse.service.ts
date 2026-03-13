import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class SseService {
  private events$ = new Subject<any>();
  private connectionCount = 0;

  sendEvent(event: any) {
    console.log(`[SSE-SERVER] 📢 Broadcasting event: ${event.event} (Token: ${event.token || 'global'})`);
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
