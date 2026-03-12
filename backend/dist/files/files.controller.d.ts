import { FilesService } from './files.service';
export declare class FilesController {
    private readonly filesService;
    constructor(filesService: FilesService);
    getPublicFiles(eventId: string): Promise<import("./file.entity").FileRecord[]>;
    getAllFiles(eventId: string): Promise<import("./file.entity").FileRecord[]>;
    uploadFile(file: Express.Multer.File, eventId: string): Promise<import("./file.entity").FileRecord>;
    togglePublic(id: string): Promise<import("./file.entity").FileRecord>;
    update(id: string, data: any): Promise<import("./file.entity").FileRecord | null>;
    deleteFile(id: string): Promise<{
        success: boolean;
    }>;
}
