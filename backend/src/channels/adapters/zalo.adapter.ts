import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ChannelAdapter, ContactProfile, IncomingMessage, RawRequest, splitText } from '../channel.interface';

// Zalo Official Account API — Docs: https://developers.zalo.me/docs/official-account
// Lưu ý: OA access token hết hạn sau ~25 giờ -> production cần luồng refresh token (xem README).
@Injectable()
export class ZaloAdapter implements ChannelAdapter {
  readonly channel = 'ZALO' as const;

  constructor(private readonly config: ConfigService) {}

  private get headers() {
    return { 'Content-Type': 'application/json', access_token: this.config.get<string>('zalo.accessToken') ?? '' };
  }

  // Header X-ZEvent-Signature: "mac=" + sha256(appId + body + timestamp + OASecretKey)
  // Hãy đối chiếu công thức với tài liệu Zalo hiện hành trước khi bật ở production.
  verifySignature(req: RawRequest): boolean {
    const secret = this.config.get<string>('zalo.oaSecretKey');
    if (!secret) return true; // dev: chưa cấu hình thì bỏ qua
    if (!req.rawBody) return false;
    const signature = String(req.headers['x-zevent-signature'] ?? '');
    const expected = 'mac=' + createHash('sha256')
      .update(`${this.config.get('zalo.appId')}${req.rawBody.toString('utf8')}${req.body?.timestamp}${secret}`)
      .digest('hex');
    return signature === expected;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(body: any): IncomingMessage[] {
    if (body?.event_name !== 'user_send_text' || !body.message?.text) return [];
    return [{
      channel: this.channel,
      externalUserId: body.sender.id,
      text: body.message.text,
      externalMessageId: body.message.msg_id,
    }];
  }

  async sendText(userId: string, text: string): Promise<void> {
    for (const part of splitText(text)) {
      const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ recipient: { user_id: userId }, message: { text: part } }),
      });
      const json = await res.json();
      if (json.error !== 0) throw new Error(`Zalo send lỗi ${json.error}: ${json.message}`);
    }
  }

  async getProfile(userId: string): Promise<ContactProfile> {
    const data = encodeURIComponent(JSON.stringify({ user_id: userId }));
    const res = await fetch(`https://openapi.zalo.me/v3.0/oa/user/detail?data=${data}`, { headers: this.headers });
    const json = await res.json();
    if (json.error !== 0) return {};
    return { name: json.data?.display_name, avatarUrl: json.data?.avatar };
  }
}
