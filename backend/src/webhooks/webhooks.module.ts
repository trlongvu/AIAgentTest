import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { ChannelsModule } from '../channels/channels.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { InboundService } from './inbound.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [ChannelsModule, ContactsModule, ConversationsModule, BotModule],
  controllers: [WebhooksController],
  providers: [InboundService],
})
export class WebhooksModule {}
