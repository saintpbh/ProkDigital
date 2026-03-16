import { Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { FirebaseStorageService } from './firebase-storage.service';
import { STORAGE_PROVIDER } from './storage.interface';

@Module({
    providers: [
        {
            provide: STORAGE_PROVIDER,
            // Dynamically switch based on environment if needed, but for now we move to Firebase
            useClass: process.env.FIREBASE_SERVICE_ACCOUNT ? FirebaseStorageService : LocalStorageService,
        },
    ],
    exports: [STORAGE_PROVIDER],
})
export class StorageModule { }
