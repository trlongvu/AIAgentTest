import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import type { Channel, ConversationStatus, HandledBy } from '@prisma/client';

export class ListConversationsQuery {
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: ConversationStatus;

  @IsOptional()
  @IsIn(['BOT', 'HUMAN'])
  handledBy?: HandledBy;

  @IsOptional()
  @IsIn(['MESSENGER', 'ZALO', 'WEB'])
  channel?: Channel;

  /** 'me' = hội thoại được giao cho tôi */
  @IsOptional()
  @IsIn(['me'])
  assignee?: 'me';
}

export class UpdateConversationDto {
  @IsOptional()
  @IsIn(['BOT', 'HUMAN'])
  handledBy?: HandledBy;

  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: ConversationStatus;

  /** null = bỏ phân công */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  assigneeId?: number | null;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  content!: string;
}
