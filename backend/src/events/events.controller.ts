import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('api/events')
export class EventsController {
    constructor(private readonly eventsService: EventsService) { }

    @Post()
    create(@Body('name') name: string, @Body('passcode') passcode: string) {
        return this.eventsService.create(name, passcode);
    }

    @Get()
    findAll() {
        return this.eventsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.eventsService.findOne(+id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.eventsService.update(+id, data);
    }

    @Get('token/:token')
    findByToken(@Param('token') token: string) {
        return this.eventsService.findByToken(token);
    }

    @Post('validate')
    validatePasscode(@Body('token') token: string, @Body('passcode') passcode: string) {
        return this.eventsService.validatePasscode(token, passcode);
    }

    @Post(':id/links')
    addLink(@Param('id') id: string, @Body('title') title: string, @Body('url') url: string) {
        return this.eventsService.addLink(+id, title, url);
    }

    @Patch('links/:id/toggle')
    toggleLink(@Param('id') id: string) {
        return this.eventsService.toggleLinkPublic(+id);
    }

    @Get(':id/qr')
    async getQrCode(@Param('id') id: string) {
        const event = await this.eventsService.findOne(+id);
        const QRCode = require('qrcode');
        const joinUrl = `http://localhost:5174/join/${event.token}`;
        const qrCodeDataUrl = await QRCode.toDataURL(joinUrl);
        return { qrCode: qrCodeDataUrl, joinUrl };
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.eventsService.remove(+id);
    }

    @Delete('links/:id')
    removeLink(@Param('id') id: string) {
        return this.eventsService.removeLink(+id);
    }

    @Patch('links/:id')
    updateLink(@Param('id') id: string, @Body() data: any) {
        return this.eventsService.updateLink(+id, data);
    }

    @Post(':id/announce')
    announce(@Param('id') id: string, @Body('message') message: string) {
        return this.eventsService.broadcastAnnouncement(+id, message);
    }
}
