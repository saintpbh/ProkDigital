import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrCodeService {
    async generateDataURL(text: string): Promise<string> {
        try {
            return await QRCode.toDataURL(text);
        } catch (err) {
            console.error('QR Code generation failed', err);
            throw err;
        }
    }
}
