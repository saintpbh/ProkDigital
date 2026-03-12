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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SseController = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const sse_service_1 = require("./sse.service");
let SseController = class SseController {
    sseService;
    constructor(sseService) {
        this.sseService = sseService;
    }
    sse() {
        this.sseService.incrementConnections();
        const keepAlive$ = (0, rxjs_1.interval)(15000).pipe((0, rxjs_1.map)(() => ({ data: { event: 'keep-alive' } })));
        const event$ = this.sseService.getEvents();
        return (0, rxjs_1.merge)(keepAlive$, event$).pipe((0, rxjs_1.finalize)(() => {
            this.sseService.decrementConnections();
        }));
    }
};
exports.SseController = SseController;
__decorate([
    (0, common_1.Sse)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", rxjs_1.Observable)
], SseController.prototype, "sse", null);
exports.SseController = SseController = __decorate([
    (0, common_1.Controller)('api/stream'),
    __metadata("design:paramtypes", [sse_service_1.SseService])
], SseController);
//# sourceMappingURL=sse.controller.js.map