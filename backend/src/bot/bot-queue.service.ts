import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export const BOT_QUEUE = 'bot-replies';

export interface BotReplyJob {
  conversationId: number;
  messageId: number;
}

// Chờ một chút trước khi trả lời: khách hay gõ nhiều tin liên tiếp ("alo", "shop ơi", "còn hàng ko").
// Processor chỉ xử lý job của tin MỚI NHẤT nên bot trả lời một lần cho cả cụm.
const DEBOUNCE_MS = 2500;

@Injectable()
export class BotQueueService {
  constructor(@InjectQueue(BOT_QUEUE) private readonly queue: Queue<BotReplyJob>) {}

  enqueueReply(job: BotReplyJob) {
    return this.queue.add('reply', job, {
      delay: DEBOUNCE_MS,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}
