import { Injectable, NotFoundException } from '@nestjs/common';
import { Contact, MessageRole, Prisma } from '@prisma/client';
import { ChannelRegistry } from '../channels/channel-registry.service';
import { AuthUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ListConversationsQuery, UpdateConversationDto } from './conversations.dto';

const LIST_INCLUDE = {
  contact: true,
  assignee: { select: { id: true, name: true } },
  messages: { orderBy: { id: 'desc' }, take: 1 }, // tin cuối để hiện preview
} satisfies Prisma.ConversationInclude;

export interface NewMessage {
  conversationId: number;
  role: MessageRole;
  content: string;
  externalId?: string;
  senderId?: number;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly channels: ChannelRegistry,
  ) {}

  async findOrCreateOpen(contact: Contact) {
    const open = await this.prisma.conversation.findFirst({
      where: { contactId: contact.id, status: 'OPEN' },
      orderBy: { id: 'desc' },
    });
    if (open) return open;
    const created = await this.prisma.conversation.create({
      data: { contactId: contact.id, channel: contact.channel },
      include: LIST_INCLUDE,
    });
    this.realtime.emitConversationUpdated(created);
    return created;
  }

  // Lưu tin + cập nhật thời gian + đẩy realtime. Trả về null nếu trùng (webhook gửi lại)
  async addMessage(input: NewMessage) {
    try {
      const [message] = await this.prisma.$transaction([
        this.prisma.message.create({ data: input }),
        this.prisma.conversation.update({ where: { id: input.conversationId }, data: { lastMessageAt: new Date() } }),
      ]);
      this.realtime.emitMessage(input.conversationId, message);
      return message;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
  }

  list(query: ListConversationsQuery, user: AuthUser) {
    return this.prisma.conversation.findMany({
      where: {
        status: query.status,
        handledBy: query.handledBy,
        channel: query.channel,
        ...(query.assignee === 'me' && { assigneeId: user.id }),
      },
      include: LIST_INCLUDE,
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
  }

  async get(id: number) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id }, include: LIST_INCLUDE });
    if (!conversation) throw new NotFoundException();
    return conversation;
  }

  async messages(conversationId: number, limit = 200) {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { id: 'desc' },
      take: limit,
      include: { sender: { select: { id: true, name: true } } },
    });
    return rows.reverse();
  }

  async latestCustomerMessageId(conversationId: number) {
    const last = await this.prisma.message.findFirst({
      where: { conversationId, role: 'CUSTOMER' },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return last?.id ?? null;
  }

  async update(id: number, data: UpdateConversationDto & { handoffReason?: string | null }) {
    // Giao lại cho bot thì xoá lý do chuyển người cũ
    if (data.handledBy === 'BOT') data.handoffReason = null;
    const conversation = await this.prisma.conversation.update({ where: { id }, data, include: LIST_INCLUDE });
    this.realtime.emitConversationUpdated(conversation);
    return conversation;
  }

  // Nhân viên trả lời từ dashboard -> tự động tiếp quản (bot ngừng trả lời hội thoại này)
  async sendAgentMessage(id: number, user: AuthUser, content: string) {
    const conversation = await this.get(id);
    await this.channels.get(conversation.channel).sendText(conversation.contact.externalId, content);
    const message = await this.addMessage({ conversationId: id, role: 'AGENT', content, senderId: user.id });
    if (conversation.handledBy === 'BOT' || !conversation.assigneeId) {
      await this.update(id, { handledBy: 'HUMAN', assigneeId: conversation.assigneeId ?? user.id });
    }
    return message;
  }
}
