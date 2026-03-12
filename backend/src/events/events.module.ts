import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { LinkRecord } from './link.entity';
import { EventsService } from './events.service';
import { VotesService } from './votes.service';
import { EventsController } from './events.controller';
import { VotesController } from './votes.controller';
import { QrCodeService } from './qr-code.service';
import { SseModule } from '../sse/sse.module';
import { Vote, VoteOption, VoteRecord } from './vote.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Event, LinkRecord, Vote, VoteOption, VoteRecord]),
        SseModule,
    ],
    providers: [EventsService, VotesService, QrCodeService],
    controllers: [EventsController, VotesController],
    exports: [EventsService, VotesService, QrCodeService],
})
export class EventsModule { }
