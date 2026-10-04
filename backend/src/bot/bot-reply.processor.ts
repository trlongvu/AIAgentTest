import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AgentService } from '../ai/agent.service';
import { ChannelRegistry } from '../channels/channel-registry.service';
import { ConversationsService } from '../conversations/conversations.service';
import { SettingsService } from '../settings/settings.service';
import { BOT_QUEUE, BotReplyJob } from './bot-queue.service';

// "Bộ não" chạy nền: lấy job từ hàng đợi -> RAG + LLM -> gửi trả lời về đúng kênh.
// concurrency: số hội thoại được xử lý song song.
@Processor(BOT_QUEUE, { concurrency: 5 })
export class BotReplyProcessor extends WorkerHost {
  private readonly logger = new Logger(BotReplyProcessor.name);

  constructor(
    private readonly agent: AgentService,
    private readonly conversations: ConversationsService,
    private readonly channels: ChannelRegistry,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async process(job: Job<BotReplyJob>) {
    const { conversationId, messageId } = job.data;

    if (!(await this.botShouldReply(conversationId))) return 'skip: bot tắt hoặc nhân viên đang xử lý';

    // Khách gửi thêm tin sau tin này -> để job của tin mới nhất trả lời một lần cho cả cụm
    if ((await this.conversations.latestCustomerMessageId(conversationId)) !== messageId) {
      return 'skip: có tin mới hơn';
    }

    const reply = await this.agent.generateReply(conversationId);

    // Trong lúc AI suy nghĩ, nhân viên có thể đã bấm tiếp quản
    if (!(await this.botShouldReply(conversationId))) return 'skip: nhân viên vừa tiếp quản';

    const conversation = await this.conversations.get(conversationId);
    if (reply.text) {
      await this.channels.get(conversation.channel).sendText(conversation.contact.externalId, reply.text);
      await this.conversations.addMessage({
        conversationId,
        role: 'BOT',
        content: reply.text,
        metadata: { sources: reply.sources, handoff: reply.handoff },
      });
    }

    if (reply.handoff) {
      await this.conversations.update(conversationId, { handledBy: 'HUMAN', handoffReason: reply.reason ?? null });
      this.logger.log(`Hội thoại ${conversationId} chuyển cho nhân viên: ${reply.reason}`);
    }
    return { handoff: reply.handoff };
  }

  private async botShouldReply(conversationId: number) {
    const [settings, conversation] = await Promise.all([
      this.settings.get(),
      this.conversations.get(conversationId),
    ]);
    return settings.botEnabled && conversation.handledBy === 'BOT' && conversation.status === 'OPEN';
  }
}
