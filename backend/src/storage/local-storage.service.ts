import { Injectable } from '@nestjs/common';
import { IStorageProvider } from './storage.interface';
import { unlink } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class LocalStorageService implements IStorageProvider {
    async uploadFile(file: Express.Multer.File): Promise<{ url: string; filename: string }> {
        // Multer already handled the file saving to ./uploads
        return {
            url: `/uploads/${file.filename}`,
            filename: file.filename,
        };
    }

    async deleteFile(url: string): Promise<void> {
        const filename = url.replace('/uploads/', '');
        const filePath = join(process.cwd(), 'uploads', filename);
        try {
            await unlink(filePath);
        } catch (err) {
            console.error(`Failed to delete local file: ${filePath}`, err);
        }
    }
}
