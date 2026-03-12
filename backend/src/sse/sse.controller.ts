import { Controller, Sse, MessageEvent, OnModuleInit } from '@nestjs/common';
import { Observable, interval, map, merge, finalize } from 'rxjs';
import { SseService } from './sse.service';

@Controller('api/stream')
export class SseController {
    constructor(private readonly sseService: SseService) { }

    @Sse()
    sse(): Observable<MessageEvent> {
        this.sseService.incrementConnections();

        // Keep-alive signal every 15 seconds to prevent timeout
        const keepAlive$ = interval(15000).pipe(
            map(() => ({ data: { event: 'keep-alive' } } as MessageEvent)),
        );

        const event$ = this.sseService.getEvents();

        return merge(keepAlive$, event$).pipe(
            finalize(() => {
                this.sseService.decrementConnections();
            }),
        );
    }
}
