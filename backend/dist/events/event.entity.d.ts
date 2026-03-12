import { FileRecord } from '../files/file.entity';
import { LinkRecord } from './link.entity';
export declare class Event {
    id: number;
    name: string;
    passcode: string;
    token: string;
    is_active: boolean;
    current_announcement: string | null;
    created_at: Date;
    files: FileRecord[];
    links: LinkRecord[];
}
