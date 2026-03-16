import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TunnelService } from './tunnel.service';
import { SseModule } from './sse/sse.module';
import { FilesModule } from './files/files.module';
import { FileRecord } from './files/file.entity';
import { StorageModule } from './storage/storage.module';
import { EventsModule } from './events/events.module';
import { FirebaseModule } from './firebase/firebase.module';
import { Event } from './events/event.entity';
import { LinkRecord } from './events/link.entity';
import { Vote, VoteOption, VoteRecord } from './events/vote.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [FileRecord, Event, LinkRecord, Vote, VoteOption, VoteRecord],
      synchronize: true,
    }),
    SseModule,
    FilesModule,
    StorageModule,
    EventsModule,
    FirebaseModule,
  ],
  controllers: [AppController],
  providers: [AppService, TunnelService],
})
export class AppModule { }
