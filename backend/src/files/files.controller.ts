import { Controller, Get, Post, Body, Param, Patch, Delete, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('api/files')
export class FilesController {
    constructor(private readonly filesService: FilesService) { }

    @Get()
    getPublicFiles(@Query('eventId') eventId: string) {
        return this.filesService.findPublicByEvent(+eventId);
    }

    @Get('admin')
    getAllFiles(@Query('eventId') eventId: string) {
        return this.filesService.findAllByEvent(+eventId);
    }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: './uploads',
            filename: (req, file, cb) => {
                const randomName = Array(32).fill(null).map(() => (Math.round(Math.random() * 16)).toString(16)).join('');
                cb(null, `${randomName}${extname(file.originalname)}`);
            },
        }),
    }))
    uploadFile(@UploadedFile() file: Express.Multer.File, @Query('eventId') eventId: string) {
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        return this.filesService.createWithStorage(file, +eventId);
    }

    @Patch(':id/toggle')
    togglePublic(@Param('id') id: string) {
        return this.filesService.togglePublic(+id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() data: any) {
        return this.filesService.update(+id, data);
    }

    @Delete(':id')
    deleteFile(@Param('id') id: string) {
        return this.filesService.delete(+id);
    }
}
