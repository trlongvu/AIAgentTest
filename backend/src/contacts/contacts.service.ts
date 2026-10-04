import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Channel, Prisma } from '@prisma/client';
import { ChannelRegistry } from '../channels/channel-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListContactsQuery, UpdateContactDto } from './contacts.dto';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelRegistry,
  ) {}

  // Gặp khách lần đầu -> tạo contact và thử lấy tên/ảnh từ nền tảng
  async findOrCreate(channel: Channel, externalId: string, name?: string) {
    const existing = await this.prisma.contact.findUnique({ where: { channel_externalId: { channel, externalId } } });
    if (existing) return existing;

    let profile = {};
    try {
      profile = (await this.channels.get(channel).getProfile?.(externalId)) ?? {};
    } catch (err) {
      this.logger.warn(`Không lấy được profile ${channel}/${externalId}: ${(err as Error).message}`);
    }

    return this.prisma.contact.upsert({
      where: { channel_externalId: { channel, externalId } },
      update: {},
      create: { channel, externalId, name, ...profile },
    });
  }

  list({ q, tag, channel }: ListContactsQuery) {
    const where: Prisma.ContactWhereInput = {
      channel,
      ...(tag && { tags: { has: tag } }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };
    return this.prisma.contact.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { _count: { select: { conversations: true } } },
    });
  }

  async get(id: number) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { conversations: { orderBy: { lastMessageAt: 'desc' }, take: 20 } },
    });
    if (!contact) throw new NotFoundException();
    return contact;
  }

  update(id: number, dto: UpdateContactDto) {
    return this.prisma.contact.update({ where: { id }, data: dto });
  }
}
