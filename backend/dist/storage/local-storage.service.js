"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageService = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("fs/promises");
const path_1 = require("path");
let LocalStorageService = class LocalStorageService {
    async uploadFile(file) {
        return {
            url: `/uploads/${file.filename}`,
            filename: file.filename,
        };
    }
    async deleteFile(url) {
        const filename = url.replace('/uploads/', '');
        const filePath = (0, path_1.join)(process.cwd(), 'uploads', filename);
        try {
            await (0, promises_1.unlink)(filePath);
        }
        catch (err) {
            console.error(`Failed to delete local file: ${filePath}`, err);
        }
    }
};
exports.LocalStorageService = LocalStorageService;
exports.LocalStorageService = LocalStorageService = __decorate([
    (0, common_1.Injectable)()
], LocalStorageService);
//# sourceMappingURL=local-storage.service.js.map