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
exports.EventsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const event_entity_1 = require("./event.entity");
const link_entity_1 = require("./link.entity");
const sse_service_1 = require("../sse/sse.service");
let EventsService = class EventsService {
    eventRepository;
    linkRepository;
    sseService;
    constructor(eventRepository, linkRepository, sseService) {
        this.eventRepository = eventRepository;
        this.linkRepository = linkRepository;
        this.sseService = sseService;
    }
    async create(name, passcode) {
        const event = new event_entity_1.Event();
        event.name = name;
        event.passcode = passcode;
        event.token = Math.random().toString(36).substring(2, 15);
        event.is_active = true;
        return this.eventRepository.save(event);
    }
    async findAll() {
        return this.eventRepository.find({ order: { created_at: 'DESC' } });
    }
    async findOne(id) {
        const event = await this.eventRepository.findOne({
            where: { id },
            relations: ['files', 'links'],
            order: {
                files: { id: 'DESC' },
                links: { id: 'DESC' }
            }
        });
        if (!event)
            throw new common_1.NotFoundException('Event not found');
        return event;
    }
    async findByToken(token) {
        const event = await this.eventRepository.findOne({ where: { token, is_active: true } });
        if (!event)
            throw new common_1.NotFoundException('Event not found or inactive');
        return event;
    }
    async validatePasscode(token, passcode) {
        const event = await this.findByToken(token);
        return event.passcode === passcode;
    }
    async update(id, data) {
        await this.eventRepository.update(id, data);
        return this.findOne(id);
    }
    async addLink(eventId, title, url) {
        const event = await this.findOne(eventId);
        const link = new link_entity_1.LinkRecord();
        link.title = title;
        link.url = url;
        link.event = event;
        link.is_public = false;
        return this.linkRepository.save(link);
    }
    async toggleLinkPublic(id) {
        const link = await this.linkRepository.findOne({ where: { id }, relations: ['event'] });
        if (!link)
            throw new common_1.NotFoundException('Link not found');
        link.is_public = !link.is_public;
        const updated = await this.linkRepository.save(link);
        const eventToken = updated.event?.token;
        if (updated.is_public) {
            this.sseService.sendEvent({
                event: 'link_published',
                data: {
                    id: updated.id,
                    title: updated.title,
                    url: updated.url,
                    published_at: updated.published_at,
                    token: eventToken,
                },
            });
        }
        else {
            this.sseService.sendEvent({
                event: 'link_hidden',
                data: { id: updated.id, token: eventToken },
            });
        }
        return updated;
    }
    async remove(id) {
        const event = await this.findOne(id);
        return this.eventRepository.remove(event);
    }
    async removeLink(id) {
        const link = await this.linkRepository.findOne({ where: { id } });
        if (!link)
            throw new common_1.NotFoundException('Link not found');
        return this.linkRepository.remove(link);
    }
    async updateLink(id, data) {
        await this.linkRepository.update(id, data);
        return this.linkRepository.findOne({ where: { id } });
    }
    async broadcastAnnouncement(eventId, message) {
        const event = await this.findOne(eventId);
        event.current_announcement = message;
        await this.eventRepository.save(event);
        this.sseService.sendEvent({
            event: 'announcement_broadcast',
            data: {
                token: event.token,
                message: message
            }
        });
        return { success: true };
    }
};
exports.EventsService = EventsService;
exports.EventsService = EventsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(event_entity_1.Event)),
    __param(1, (0, typeorm_1.InjectRepository)(link_entity_1.LinkRecord)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        sse_service_1.SseService])
], EventsService);
//# sourceMappingURL=events.service.js.map