import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { LinkRecord } from './link.entity';
import { SseService } from '../sse/sse.service';

@Injectable()
export class EventsService {
    constructor(
        @InjectRepository(Event)
        private readonly eventRepository: Repository<Event>,
        @InjectRepository(LinkRecord)
        private readonly linkRepository: Repository<LinkRecord>,
        private readonly sseService: SseService,
    ) { }

    async create(name: string, passcode: string) {
        const event = new Event();
        event.name = name;
        event.passcode = passcode;
        event.token = Math.random().toString(36).substring(2, 15);
        event.is_active = true;
        return this.eventRepository.save(event);
    }

    async findAll() {
        return this.eventRepository.find({ order: { created_at: 'DESC' } });
    }

    async findOne(id: number) {
        const event = await this.eventRepository.findOne({
            where: { id },
            relations: ['files', 'links'],
            order: {
                files: { id: 'DESC' },
                links: { id: 'DESC' }
            }
        });
        if (!event) throw new NotFoundException('Event not found');
        return event;
    }

    async findByToken(token: string) {
        const event = await this.eventRepository.findOne({ 
            where: { token, is_active: true },
            relations: ['files', 'links'],
            order: {
                files: { id: 'DESC' },
                links: { id: 'DESC' }
            }
        });
        if (!event) throw new NotFoundException('Event not found or inactive');
        return event;
    }

    async validatePasscode(token: string, passcode: string) {
        const event = await this.findByToken(token);
        return event.passcode === passcode;
    }

    async update(id: number, data: Partial<Event>) {
        await this.eventRepository.update(id, data);
        return this.findOne(id);
    }

    async addLink(eventId: number, title: string, url: string) {
        const event = await this.findOne(eventId);
        const link = new LinkRecord();
        link.title = title;
        link.url = url;
        link.event = event;
        link.is_public = false;
        return this.linkRepository.save(link);
    }

    async toggleLinkPublic(id: number) {
        const link = await this.linkRepository.findOne({ where: { id }, relations: ['event'] });
        if (!link) throw new NotFoundException('Link not found');

        link.is_public = !link.is_public;
        const updated = await this.linkRepository.save(link);
        const eventToken = updated.event?.token;

        if (eventToken) {
            if (updated.is_public) {
                this.sseService.sendEvent({
                    event: 'link_published',
                    token: eventToken,
                    data: {
                        id: updated.id,
                        title: updated.title,
                        url: updated.url,
                        published_at: updated.published_at,
                        is_public: updated.is_public, // Include is_public for consistency
                    },
                });
            } else {
                this.sseService.sendEvent({
                    event: 'link_hidden',
                    token: eventToken,
                    data: {
                        id: updated.id,
                        is_public: updated.is_public, // Include is_public for consistency
                    },
                });
            }
        }
        return updated;
    }

    async remove(id: number) {
        const event = await this.findOne(id);
        return this.eventRepository.remove(event);
    }

    async removeLink(id: number) {
        const link = await this.linkRepository.findOne({ where: { id }, relations: ['event'] });
        if (!link) throw new NotFoundException('Link not found');
        const eventToken = link.event?.token;
        await this.linkRepository.remove(link);

        if (eventToken) {
            this.sseService.sendEvent({
                event: 'link_hidden',
                token: eventToken,
                data: { id }
            });
        }
        return { success: true };
    }

    async updateLink(id: number, data: Partial<LinkRecord>) {
        await this.linkRepository.update(id, data);
        return this.linkRepository.findOne({ where: { id } });
    }

    async broadcastAnnouncement(eventId: number, message: string | null) {
        const event = await this.findOne(eventId);
        event.current_announcement = message;
        await this.eventRepository.save(event);

        this.sseService.sendEvent({
            event: 'announcement_broadcast',
            token: event.token,
            data: {
                message: message
            }
        });

        return { success: true };
    }
}
