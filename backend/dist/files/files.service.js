"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const file_entity_1 = require("./file.entity");
const sse_service_1 = require("../sse/sse.service");
const storage_interface_1 = require("../storage/storage.interface");
const event_entity_1 = require("../events/event.entity");
let FilesService = class FilesService {
    fileRepository;
    eventRepository;
    sseService;
    storageProvider;
    constructor(fileRepository, eventRepository, sseService, storageProvider) {
        this.fileRepository = fileRepository;
        this.eventRepository = eventRepository;
        this.sseService = sseService;
        this.storageProvider = storageProvider;
    }
    async createWithStorage(file, eventId) {
        const event = await this.eventRepository.findOne({ where: { id: eventId } });
        if (!event)
            throw new common_1.NotFoundException('Event not found');
        const { url } = await this.storageProvider.uploadFile(file);
        const fileRecord = new file_entity_1.FileRecord();
        fileRecord.title = file.originalname;
        fileRecord.url = url;
        fileRecord.file_size = `${(file.size / 1024 / 1024).toFixed(2)}MB`;
        fileRecord.is_public = false;
        fileRecord.event = event;
        return this.fileRepository.save(fileRecord);
    }
    async update(id, data) {
        await this.fileRepository.update(id, data);
        return this.fileRepository.findOne({ where: { id } });
    }
    async delete(id) {
        const file = await this.fileRepository.findOne({ where: { id } });
        if (!file)
            throw new common_1.NotFoundException();
        await this.storageProvider.deleteFile(file.url);
        await this.fileRepository.remove(file);
        return { success: true };
    }
    async findAllByEvent(eventId) {
        return this.fileRepository.find({
            where: { event: { id: eventId } },
            order: { id: 'DESC' }
        });
    }
    async findPublicByEvent(eventId) {
        return this.fileRepository.find({
            where: { event: { id: eventId }, is_public: true },
            order: { id: 'DESC' },
        });
    }
    async togglePublic(id) {
        const file = await this.fileRepository.findOne({ where: { id }, relations: ['event'] });
        if (!file)
            throw new common_1.NotFoundException();
        file.is_public = !file.is_public;
        const updated = await this.fileRepository.save(file);
        const eventToken = file.event?.token;
        if (updated.is_public) {
            this.sseService.sendEvent({
                event: 'file_published',
                data: {
                    id: updated.id,
                    title: updated.title,
                    url: updated.url,
                    file_size: updated.file_size,
                    published_at: updated.published_at,
                    token: eventToken,
                },
            });
            this.triggerPushNotification(updated);
        }
        else {
            this.sseService.sendEvent({
                event: 'file_hidden',
                data: { id: updated.id, token: eventToken },
            });
        }
        return updated;
    }
    triggerPushNotification(file) {
        console.log(`[FCM] Sending push notification for: ${file.title}`);
    }
};
exports.FilesService = FilesService;
exports.FilesService = FilesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(file_entity_1.FileRecord)),
    __param(1, (0, typeorm_1.InjectRepository)(event_entity_1.Event)),
    __param(3, (0, common_1.Inject)(storage_interface_1.STORAGE_PROVIDER)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        sse_service_1.SseService, Object])
], FilesService);
//# sourceMappingURL=files.service.js.map