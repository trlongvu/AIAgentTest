import { Module } from '@nestjs/common';
import { MessengerAdapter } from './adapters/messenger.adapter';
import { WebAdapter } from './adapters/web.adapter';
import { ZaloAdapter } from './adapters/zalo.adapter';
import { ChannelRegistry } from './channel-registry.service';

@Module({
  providers: [MessengerAdapter, ZaloAdapter, WebAdapter, ChannelRegistry],
  exports: [ChannelRegistry],
})
export class ChannelsModule {}
