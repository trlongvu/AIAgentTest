import { Injectable } from '@nestjs/common';
import type { Channel } from '@prisma/client';
import { MessengerAdapter } from './adapters/messenger.adapter';
import { WebAdapter } from './adapters/web.adapter';
import { ZaloAdapter } from './adapters/zalo.adapter';
import { ChannelAdapter } from './channel.interface';

// Tra cứu adapter theo tên kênh: registry.get('ZALO').sendText(...)
@Injectable()
export class ChannelRegistry {
  private readonly adapters: Record<Channel, ChannelAdapter>;

  constructor(messenger: MessengerAdapter, zalo: ZaloAdapter, web: WebAdapter) {
    this.adapters = { MESSENGER: messenger, ZALO: zalo, WEB: web };
  }

  get(channel: Channel): ChannelAdapter {
    return this.adapters[channel];
  }
}
