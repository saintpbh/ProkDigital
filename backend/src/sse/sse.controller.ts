import { Controller, Sse, MessageEvent, Header, Res } from '@nestjs/common';
import { Observable, interval, map, merge, finalize, of } from 'rxjs';
import { type Response } from 'express';
import { SseService } from './sse.service';

@Controller('api/stream')
export class SseController {
    constructor(private readonly sseService: SseService) { }

    @Sse()
    sse(@Res() res: Response): Observable<any> {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        this.sseService.incrementConnections();

        // 32KB padding to burst aggressive proxy buffers (Cloudflare/Nginx)
        const padding = ' '.repeat(32768); 
        const welcome$ = of({ 
            data: { 
                event: 'welcome', 
                message: 'SSE Connection Established (Super Burst Mode)',
                padding: padding
            } 
        });

        const keepAlive$ = interval(3000).pipe(
            map(() => ({ 
                data: { 
                    event: 'keep-alive', 
                    timestamp: new Date().toISOString(),
                    padding: '-'.repeat(1024) // Periodic padding to keep the pipe open
                } 
            }))
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
