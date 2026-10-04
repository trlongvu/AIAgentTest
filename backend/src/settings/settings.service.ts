import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './settings.dto';

// Cấu hình bot lưu trong DB (1 dòng duy nhất id=1)
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.botSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  update(dto: UpdateSettingsDto) {
    return this.prisma.botSettings.upsert({ where: { id: 1 }, update: dto, create: { id: 1, ...dto } });
  }
}
