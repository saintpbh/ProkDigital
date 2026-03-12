"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SseService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
let SseService = class SseService {
    events$ = new rxjs_1.Subject();
    connectionCount = 0;
    sendEvent(event) {
        this.events$.next(event);
    }
    getEvents() {
        return this.events$.asObservable().pipe((0, operators_1.map)((data) => ({ data })));
    }
    incrementConnections() {
        this.connectionCount++;
        this.broadcastCount();
    }
    decrementConnections() {
        this.connectionCount = Math.max(0, this.connectionCount - 1);
        this.broadcastCount();
    }
    getConnectionCount() {
        return this.connectionCount;
    }
    broadcastCount() {
        this.sendEvent({ event: 'connection_count', count: this.connectionCount });
    }
};
exports.SseService = SseService;
exports.SseService = SseService = __decorate([
    (0, common_1.Injectable)()
], SseService);
//# sourceMappingURL=sse.service.js.map