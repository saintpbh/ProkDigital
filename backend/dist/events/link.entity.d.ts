import { Event } from './event.entity';
export declare class LinkRecord {
    id: number;
    title: string;
    url: string;
    is_public: boolean;
    published_at: Date;
    event: Event;
}
