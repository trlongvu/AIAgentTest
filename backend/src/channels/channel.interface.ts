import type { Channel } from '@prisma/client';
import type { Request } from 'express';

// Tin nhắn vào ở dạng CHUẨN — mọi kênh đều phải chuyển webhook của mình về dạng này
export interface IncomingMessage {
  channel: Channel;
  externalUserId: string;
  text: string;
  externalMessageId?: string;
  userName?: string;
}

export interface ContactProfile {
  name?: string;
  avatarUrl?: string;
}

export type RawRequest = Request & { rawBody?: Buffer };

// "Adapter" cho một nền tảng nhắn tin. Thêm kênh mới = viết 1 class implement interface này
export interface ChannelAdapter {
  readonly channel: Channel;
  /** Kiểm tra request đúng là do nền tảng gửi (chữ ký HMAC...) */
  verifySignature(req: RawRequest): boolean;
  /** Body webhook -> danh sách tin nhắn chuẩn (bỏ qua sticker, ảnh, sự kiện khác) */
  parse(body: unknown): IncomingMessage[];
  /** Gửi tin văn bản cho khách */
  sendText(externalUserId: string, text: string): Promise<void>;
  /** Lấy tên/ảnh đại diện khách (không bắt buộc) */
  getProfile?(externalUserId: string): Promise<ContactProfile>;
}

// Các nền tảng giới hạn độ dài mỗi tin (Messenger ~2000 ký tự) -> cắt nhỏ
export function splitText(text: string, max = 1900): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
