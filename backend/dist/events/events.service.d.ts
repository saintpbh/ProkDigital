import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { LinkRecord } from './link.entity';
import { SseService } from '../sse/sse.service';
export declare class EventsService {
    private readonly eventRepository;
    private readonly linkRepository;
    private readonly sseService;
    constructor(eventRepository: Repository<Event>, linkRepository: Repository<LinkRecord>, sseService: SseService);
    create(name: string, passcode: string): Promise<Event>;
    findAll(): Promise<Event[]>;
    findOne(id: number): Promise<Event>;
    findByToken(token: string): Promise<Event>;
    validatePasscode(token: string, passcode: string): Promise<boolean>;
    update(id: number, data: Partial<Event>): Promise<Event>;
    addLink(eventId: number, title: string, url: string): Promise<LinkRecord>;
    toggleLinkPublic(id: number): Promise<LinkRecord>;
    remove(id: number): Promise<Event>;
    removeLink(id: number): Promise<LinkRecord>;
    updateLink(id: number, data: Partial<LinkRecord>): Promise<LinkRecord | null>;
    broadcastAnnouncement(eventId: number, message: string | null): Promise<{
        success: boolean;
    }>;
}
