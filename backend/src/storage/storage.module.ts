import { Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { STORAGE_PROVIDER } from './storage.interface';

@Module({
    providers: [
        {
            provide: STORAGE_PROVIDER,
            useClass: LocalStorageService,
        },
    ],
    exports: [STORAGE_PROVIDER],
})
export class StorageModule { }
