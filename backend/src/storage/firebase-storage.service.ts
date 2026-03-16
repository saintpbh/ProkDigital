import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { IStorageProvider } from './storage.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FirebaseStorageService implements IStorageProvider {
  private readonly logger = new Logger(FirebaseStorageService.name);

  async uploadFile(file: Express.Multer.File): Promise<{ url: string; filename: string }> {
    try {
      const bucket = admin.storage().bucket();
      const filename = `${uuidv4()}-${file.originalname}`;
      const fileUpload = bucket.file(`uploads/${filename}`);

      await fileUpload.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
        public: true,
      });

      // Firebase Storage public URL format
      // Note: This requires the object to be public or using signed URLs
      const url = `https://storage.googleapis.com/${bucket.name}/uploads/${filename}`;
      
      this.logger.log(`File uploaded to Firebase Storage: ${filename}`);
      return { url, filename };
    } catch (error) {
      this.logger.error(`Firebase upload failed: ${error.message}`);
      throw error;
    }
  }

  async deleteFile(url: string): Promise<void> {
    try {
      const bucket = admin.storage().bucket();
      // Extract filename from URL
      const parts = url.split('/');
      const filename = parts[parts.length - 1];
      const file = bucket.file(`uploads/${filename}`);
      
      await file.delete();
      this.logger.log(`File deleted from Firebase Storage: ${filename}`);
    } catch (error) {
      this.logger.error(`Firebase delete failed: ${error.message}`);
    }
  }
}
