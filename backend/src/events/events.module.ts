import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { LinkRecord } from './link.entity';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { QrCodeService } from './qr-code.service';
import { SseModule } from '../sse/sse.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Event, LinkRecord]),
        SseModule,
    ],
    providers: [EventsService, QrCodeService],
    controllers: [EventsController],
    exports: [EventsService, QrCodeService],
})
export class EventsModule { }
