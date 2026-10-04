import { Injectable } from '@nestjs/common';
import { BotQueueService } from '../bot/bot-queue.service';
import { IncomingMessage } from '../channels/channel.interface';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../conversations/conversations.service';

// Điểm vào chung cho MỌI kênh: tin nhắn chuẩn -> lưu DB -> báo realtime -> xếp hàng cho bot
@Injectable()
export class InboundService {
  constructor(
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly botQueue: BotQueueService,
  ) {}

  async handle(incoming: IncomingMessage) {
    const contact = await this.contacts.findOrCreate(incoming.channel, incoming.externalUserId, incoming.userName);
    const conversation = await this.conversations.findOrCreateOpen(contact);
    const message = await this.conversations.addMessage({
      conversationId: conversation.id,
      role: 'CUSTOMER',
      content: incoming.text,
      externalId: incoming.externalMessageId,
    });
    if (!message) return { conversationId: conversation.id, duplicate: true };

    // Nhân viên đang tiếp quản thì bot im lặng. Processor còn kiểm tra lại (bot tắt toàn cục, vừa tiếp quản...)
    if (conversation.handledBy === 'BOT') {
      await this.botQueue.enqueueReply({ conversationId: conversation.id, messageId: message.id });
    }
    return { conversationId: conversation.id, message };
  }
}
