export interface IStorageProvider {
    uploadFile(file: Express.Multer.File): Promise<{
        url: string;
        filename: string;
    }>;
    deleteFile(url: string): Promise<void>;
}
export declare const STORAGE_PROVIDER = "STORAGE_PROVIDER";
