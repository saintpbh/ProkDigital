import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileRecord } from './file.entity';
import { SseService } from '../sse/sse.service';
import { STORAGE_PROVIDER } from '../storage/storage.interface';
import type { IStorageProvider } from '../storage/storage.interface';
import { Event } from '../events/event.entity';

@Injectable()
export class FilesService {
    constructor(
        @InjectRepository(FileRecord)
        private readonly fileRepository: Repository<FileRecord>,
        @InjectRepository(Event)
        private readonly eventRepository: Repository<Event>,
        private readonly sseService: SseService,
        @Inject(STORAGE_PROVIDER)
        private readonly storageProvider: IStorageProvider,
    ) { }

    async createWithStorage(file: Express.Multer.File, eventId: number) {
        const event = await this.eventRepository.findOne({ where: { id: eventId } });
        if (!event) throw new NotFoundException('Event not found');

        const { url } = await this.storageProvider.uploadFile(file);

        const fileRecord = new FileRecord();
        fileRecord.title = file.originalname;
        fileRecord.url = url;
        fileRecord.file_size = `${(file.size / 1024 / 1024).toFixed(2)}MB`;
        fileRecord.is_public = false;
        fileRecord.event = event;

        return this.fileRepository.save(fileRecord);
    }

    async update(id: number, data: Partial<FileRecord>) {
        await this.fileRepository.update(id, data);
        return this.fileRepository.findOne({ where: { id } });
    }

    async delete(id: number) {
        const file = await this.fileRepository.findOne({ where: { id }, relations: ['event'] });
        if (!file) throw new NotFoundException();

        const eventToken = file.event?.token;
        await this.storageProvider.deleteFile(file.url);
        await this.fileRepository.remove(file);

        if (eventToken) {
            this.sseService.sendEvent({
                event: 'file_hidden',
                token: eventToken,
                data: { id },
            });
        }

        return { success: true };
    }

    async findAllByEvent(eventId: number) {
        return this.fileRepository.find({
            where: { event: { id: eventId } },
            order: { id: 'DESC' }
        });
    }

    async findPublicByEvent(eventId: number) {
        return this.fileRepository.find({
            where: { event: { id: eventId }, is_public: true },
            order: { id: 'DESC' },
        });
    }

    async togglePublic(id: number) {
        const file = await this.fileRepository.findOne({ where: { id }, relations: ['event'] });
        if (!file) throw new NotFoundException();

        file.is_public = !file.is_public;
        const updated = await this.fileRepository.save(file);

        const eventToken = file.event?.token;

        if (updated.is_public) {
            this.sseService.sendEvent({
                event: 'file_published',
                token: eventToken,
                data: {
                    id: updated.id,
                    title: updated.title,
                    url: updated.url,
                    file_size: updated.file_size,
                    published_at: updated.published_at,
                },
            });

            this.triggerPushNotification(updated);
        } else {
            this.sseService.sendEvent({
                event: 'file_hidden',
                token: eventToken,
                data: { id: updated.id },
            });
        }

        return updated;
    }

    private triggerPushNotification(file: FileRecord) {
        console.log(`[FCM] Sending push notification for: ${file.title}`);
    }
}
