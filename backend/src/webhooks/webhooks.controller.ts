import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { ChannelRegistry } from '../channels/channel-registry.service';
import { RawRequest } from '../channels/channel.interface';
import { Public } from '../common/decorators';
import { InboundService } from './inbound.service';

class WebMessageDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @MinLength(1)
  text!: string;
}

// Webhook chỉ làm việc nhanh: xác thực -> lưu tin -> đưa vào hàng đợi -> trả 200.
// Việc chậm (gọi AI) để BotReplyProcessor làm, nếu không nền tảng sẽ timeout và gửi lại.
@ApiTags('webhooks')
@Public()
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly config: ConfigService,
    private readonly channels: ChannelRegistry,
    private readonly inbound: InboundService,
  ) {}

  // Facebook gọi GET một lần khi bạn đăng ký webhook để xác minh
  @Get('messenger')
  verifyMessenger(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode !== 'subscribe' || token !== this.config.get('messenger.verifyToken')) throw new ForbiddenException();
    return challenge;
  }

  @Post('messenger')
  @HttpCode(200)
  messenger(@Req() req: RawRequest) {
    return this.handleChannel('MESSENGER', req);
  }

  @Post('zalo')
  @HttpCode(200)
  zalo(@Req() req: RawRequest) {
    return this.handleChannel('ZALO', req);
  }

  // Kênh web / trang Chat thử
  @Post('web')
  @HttpCode(200)
  web(@Body() dto: WebMessageDto) {
    if (!dto.text.trim()) throw new BadRequestException('Tin nhắn trống');
    return this.inbound.handle({ channel: 'WEB', externalUserId: dto.userId, userName: dto.name, text: dto.text.trim() });
  }

  private async handleChannel(channel: 'MESSENGER' | 'ZALO', req: RawRequest) {
    const adapter = this.channels.get(channel);
    if (!adapter.verifySignature(req)) throw new ForbiddenException('Sai chữ ký webhook');
    for (const incoming of adapter.parse(req.body)) {
      await this.inbound.handle(incoming);
    }
    return 'EVENT_RECEIVED';
  }
}
