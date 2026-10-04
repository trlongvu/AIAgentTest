import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ChannelAdapter, ContactProfile, IncomingMessage, RawRequest, splitText } from '../channel.interface';

// Facebook Messenger (Meta Graph API)
// Docs: https://developers.facebook.com/docs/messenger-platform/webhooks
@Injectable()
export class MessengerAdapter implements ChannelAdapter {
  readonly channel = 'MESSENGER' as const;

  constructor(private readonly config: ConfigService) {}

  private get graphUrl() {
    return `https://graph.facebook.com/${this.config.get('messenger.graphVersion')}`;
  }

  private get token() {
    return encodeURIComponent(this.config.get<string>('messenger.pageAccessToken') ?? '');
  }

  // Meta ký body bằng App Secret (header X-Hub-Signature-256)
  verifySignature(req: RawRequest): boolean {
    const secret = this.config.get<string>('messenger.appSecret');
    if (!secret) return true; // dev: chưa cấu hình thì bỏ qua
    if (!req.rawBody) return false;
    const signature = String(req.headers['x-hub-signature-256'] ?? '');
    const expected = 'sha256=' + createHmac('sha256', secret).update(req.rawBody).digest('hex');
    return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(body: any): IncomingMessage[] {
    if (body?.object !== 'page') return [];
    const result: IncomingMessage[] = [];
    for (const entry of body.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const msg = event.message;
        if (!msg || msg.is_echo || !msg.text) continue; // bỏ tin do page gửi, sticker, ảnh...
        result.push({
          channel: this.channel,
          externalUserId: event.sender.id,
          text: msg.text,
          externalMessageId: msg.mid,
        });
      }
    }
    return result;
  }

  async sendText(recipientId: string, text: string): Promise<void> {
    for (const part of splitText(text)) {
      const res = await fetch(`${this.graphUrl}/me/messages?access_token=${this.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text: part } }),
      });
      if (!res.ok) throw new Error(`Messenger send lỗi ${res.status}: ${await res.text()}`);
    }
  }

  async getProfile(psid: string): Promise<ContactProfile> {
    const res = await fetch(`${this.graphUrl}/${psid}?fields=first_name,last_name,profile_pic&access_token=${this.token}`);
    if (!res.ok) return {};
    const data = await res.json();
    return {
      name: [data.last_name, data.first_name].filter(Boolean).join(' ') || undefined,
      avatarUrl: data.profile_pic,
    };
  }
}
