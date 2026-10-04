import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators';
import { ListConversationsQuery, SendMessageDto, UpdateConversationDto } from './conversations.dto';
import { ConversationsService } from './conversations.service';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('api/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@Query() query: ListConversationsQuery, @CurrentUser() user: AuthUser) {
    return this.conversations.list(query, user);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.conversations.get(id);
  }

  @Get(':id/messages')
  messages(@Param('id', ParseIntPipe) id: number) {
    return this.conversations.messages(id);
  }

  @Post(':id/messages')
  send(@Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto, @CurrentUser() user: AuthUser) {
    return this.conversations.sendAgentMessage(id, user, dto.content.trim());
  }

  // Tiếp quản / giao lại bot, đóng hội thoại, phân công nhân viên
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConversationDto) {
    return this.conversations.update(id, dto);
  }
}
