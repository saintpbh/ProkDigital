import { IStorageProvider } from './storage.interface';
export declare class LocalStorageService implements IStorageProvider {
    uploadFile(file: Express.Multer.File): Promise<{
        url: string;
        filename: string;
    }>;
    deleteFile(url: string): Promise<void>;
}
