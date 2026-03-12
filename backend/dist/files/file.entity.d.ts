import { Event } from '../events/event.entity';
export declare class FileRecord {
    id: number;
    title: string;
    url: string;
    is_public: boolean;
    file_size: string;
    published_at: Date;
    event: Event;
}
