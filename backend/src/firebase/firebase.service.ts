import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private db: admin.firestore.Firestore | null = null;
  private isAvailable = false;

  onModuleInit() {
    try {
      // Priority 1: Environment variable (Service Account JSON)
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
      
      if (serviceAccount) {
        const config = JSON.parse(serviceAccount);
        admin.initializeApp({
          credential: admin.credential.cert(config),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${config.project_id}.appspot.com`
        });
        this.db = admin.firestore();
        this.isAvailable = true;
        this.logger.log('✅ Firebase Admin SDK initialized successfully.');
      } else {
        this.logger.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not found. Firebase sync is disabled.');
      }
    } catch (error) {
      this.logger.error('❌ Failed to initialize Firebase Admin SDK', error);
    }
  }

  get firestore() {
    return this.db;
  }

  /**
   * Sync a document to Firestore
   */
  async syncToFirestore(collectionName: string, docId: string, data: any) {
    if (!this.isAvailable || !this.db) return;

    try {
      await this.db.collection(collectionName).doc(docId).set(data, { merge: true });
      this.logger.debug(`Synced ${collectionName}/${docId} to Firestore`);
    } catch (error) {
      this.logger.error(`Error syncing to Firestore: ${error.message}`);
    }
  }

  /**
   * Remove a document from Firestore
   */
  async deleteFromFirestore(collectionName: string, docId: string) {
    if (!this.isAvailable || !this.db) return;

    try {
      await this.db.collection(collectionName).doc(docId).delete();
      this.logger.debug(`Deleted ${collectionName}/${docId} from Firestore`);
    } catch (error) {
      this.logger.error(`Error deleting from Firestore: ${error.message}`);
    }
  }
}
