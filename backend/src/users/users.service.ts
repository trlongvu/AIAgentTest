import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './users.dto';

const PUBLIC_FIELDS = { id: true, email: true, name: true, role: true, createdAt: true } as const;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Lần chạy đầu tiên: DB chưa có ai -> tạo tài khoản admin từ .env
  async onModuleInit() {
    if ((await this.prisma.user.count()) > 0) return;
    const email = this.config.get<string>('admin.email')!;
    await this.create({ email, password: this.config.get<string>('admin.password')!, name: 'Admin', role: 'ADMIN' });
    this.logger.warn(`Đã tạo tài khoản admin: ${email} — hãy đổi mật khẩu!`);
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
  }

  list() {
    return this.prisma.user.findMany({ select: PUBLIC_FIELDS, orderBy: { id: 'asc' } });
  }

  async create(dto: CreateUserDto) {
    if (await this.findByEmail(dto.email)) throw new ConflictException('Email đã tồn tại');
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role ?? 'AGENT',
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select: PUBLIC_FIELDS,
    });
  }
}
