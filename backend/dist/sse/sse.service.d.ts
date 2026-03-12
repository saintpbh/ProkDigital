import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
export declare class SseService {
    private events$;
    private connectionCount;
    sendEvent(event: any): void;
    getEvents(): Observable<MessageEvent>;
    incrementConnections(): void;
    decrementConnections(): void;
    getConnectionCount(): number;
    private broadcastCount;
}
