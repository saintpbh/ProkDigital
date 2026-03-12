import { Repository } from 'typeorm';
import { FileRecord } from './file.entity';
import { SseService } from '../sse/sse.service';
import type { IStorageProvider } from '../storage/storage.interface';
import { Event } from '../events/event.entity';
export declare class FilesService {
    private readonly fileRepository;
    private readonly eventRepository;
    private readonly sseService;
    private readonly storageProvider;
    constructor(fileRepository: Repository<FileRecord>, eventRepository: Repository<Event>, sseService: SseService, storageProvider: IStorageProvider);
    createWithStorage(file: Express.Multer.File, eventId: number): Promise<FileRecord>;
    update(id: number, data: Partial<FileRecord>): Promise<FileRecord | null>;
    delete(id: number): Promise<{
        success: boolean;
    }>;
    findAllByEvent(eventId: number): Promise<FileRecord[]>;
    findPublicByEvent(eventId: number): Promise<FileRecord[]>;
    togglePublic(id: number): Promise<FileRecord>;
    private triggerPushNotification;
}
