import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ChannelsModule } from '../channels/channels.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { SettingsModule } from '../settings/settings.module';
import { BOT_QUEUE, BotQueueService } from './bot-queue.service';
import { BotReplyProcessor } from './bot-reply.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: BOT_QUEUE }),
    AiModule,
    ChannelsModule,
    ConversationsModule,
    SettingsModule,
  ],
  providers: [BotQueueService, BotReplyProcessor],
  exports: [BotQueueService],
})
export class BotModule {}
