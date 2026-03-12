import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FileRecord } from './file.entity';
import { SseModule } from '../sse/sse.module';
import { StorageModule } from '../storage/storage.module';
import { Event } from '../events/event.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([FileRecord, Event]),
        SseModule,
        StorageModule,
    ],
    controllers: [FilesController],
    providers: [FilesService],
})
export class FilesModule { }
