import { Controller, Sse, MessageEvent, Header, Res } from '@nestjs/common';
import { Observable, interval, map, merge, finalize, of } from 'rxjs';
import { type Response } from 'express';
import { SseService } from './sse.service';

@Controller('api/stream')
export class SseController {
    constructor(private readonly sseService: SseService) { }

    @Header('X-Accel-Buffering', 'no')
    @Header('Cache-Control', 'no-cache, no-transform')
    @Header('Connection', 'keep-alive')
    @Sse()
    sse(): Observable<MessageEvent> {
        this.sseService.incrementConnections();

        // Welcome message
        const welcome$ = of({ 
            data: { 
                event: 'welcome', 
                message: 'SSE Connection Established',
                // Keep some padding but in a safer way
                padding: ' '.repeat(4096) 
            } 
        } as MessageEvent);

        const keepAlive$ = interval(3000).pipe(
            map(() => ({ 
                data: { 
                    event: 'keep-alive', 
                    timestamp: new Date().toISOString(),
                    padding: ' '.repeat(1024) // Force flush every 3s
                } 
            } as MessageEvent))
        );

        return merge(
            welcome$,
            keepAlive$,
            this.sseService.getEvents(),
        ).pipe(
            finalize(() => {
                this.sseService.decrementConnections();
            }),
        );
    }
}
