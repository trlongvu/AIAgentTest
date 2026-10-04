import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global: mọi module đều inject được PrismaService mà không cần import
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
