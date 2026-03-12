import { EventsService } from './events.service';
export declare class EventsController {
    private readonly eventsService;
    constructor(eventsService: EventsService);
    create(name: string, passcode: string): Promise<import("./event.entity").Event>;
    findAll(): Promise<import("./event.entity").Event[]>;
    findOne(id: string): Promise<import("./event.entity").Event>;
    update(id: string, data: any): Promise<import("./event.entity").Event>;
    findByToken(token: string): Promise<import("./event.entity").Event>;
    validatePasscode(token: string, passcode: string): Promise<boolean>;
    addLink(id: string, title: string, url: string): Promise<import("./link.entity").LinkRecord>;
    toggleLink(id: string): Promise<import("./link.entity").LinkRecord>;
    getQrCode(id: string): Promise<{
        qrCode: any;
        joinUrl: string;
    }>;
    remove(id: string): Promise<import("./event.entity").Event>;
    removeLink(id: string): Promise<import("./link.entity").LinkRecord>;
    updateLink(id: string, data: any): Promise<import("./link.entity").LinkRecord | null>;
    announce(id: string, message: string): Promise<{
        success: boolean;
    }>;
}
