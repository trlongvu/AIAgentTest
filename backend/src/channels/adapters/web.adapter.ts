import { Injectable } from '@nestjs/common';
import { ChannelAdapter, IncomingMessage } from '../channel.interface';

// Kênh WEB: trang Chat thử / widget chat trên website.
// Không cần gửi đi đâu — tin trả lời đã lưu DB và đẩy qua Socket.IO tới trình duyệt của khách.
@Injectable()
export class WebAdapter implements ChannelAdapter {
  readonly channel = 'WEB' as const;

  verifySignature(): boolean {
    return true;
  }

  parse(): IncomingMessage[] {
    return []; // kênh web gửi thẳng dạng chuẩn qua WebhooksController
  }

  async sendText(): Promise<void> {}
}
