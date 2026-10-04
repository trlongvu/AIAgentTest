import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import type { Message } from '@prisma/client';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../conversations/conversations.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { SettingsService } from '../settings/settings.service';
import { LlmService } from './llm.service';
import { buildSystemPrompt, HANDOFF_REPLY } from './prompts';

const HISTORY_LIMIT = 20;
const MAX_TOOL_TURNS = 4;

// "Tool" = hành động AI được phép yêu cầu hệ thống làm.
// Muốn bot làm nhiều hơn (tra đơn hàng, đặt lịch, tạo đơn...) -> thêm tool ở đây + xử lý trong runTool().
const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'handoff_to_human',
    description:
      'Chuyển hội thoại cho nhân viên thật. Dùng khi khách yêu cầu gặp người, khiếu nại, ' +
      'muốn chốt đơn/thanh toán, hoặc câu hỏi không có trong tài liệu tham khảo.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Lý do chuyển, ngắn gọn' } },
      required: ['reason'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'save_contact_info',
    description: 'Lưu thông tin liên hệ khách vừa cung cấp trong hội thoại. Chỉ truyền trường khách đã nói rõ.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Họ tên khách' },
        phone: { type: 'string', description: 'Số điện thoại' },
        email: { type: 'string', description: 'Email' },
      },
      additionalProperties: false,
    },
  },
];

export interface AgentReply {
  text: string;
  handoff: boolean;
  reason?: string;
  sources: { title: string; similarity: number }[];
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly knowledge: KnowledgeService,
    private readonly settings: SettingsService,
    private readonly conversations: ConversationsService,
    private readonly contacts: ContactsService,
  ) {}

  async generateReply(conversationId: number): Promise<AgentReply> {
    const conversation = await this.conversations.get(conversationId);
    const history = await this.conversations.messages(conversationId, HISTORY_LIMIT);

    // ① RAG: dùng vài tin gần nhất của khách làm câu truy vấn để đủ ngữ cảnh
    const query = history.filter((m) => m.role === 'CUSTOMER').slice(-3).map((m) => m.content).join('\n');
    const hits = await this.knowledge.search(query, 5);
    const sources = hits.map((h) => ({ title: h.title, similarity: h.similarity }));

    // ② Ghép prompt: hướng dẫn + kiến thức tìm được + lịch sử hội thoại
    const system = buildSystemPrompt(await this.settings.get(), hits);
    const messages = toClaudeMessages(history);

    // ③ Vòng lặp agent: gọi Claude -> nếu Claude yêu cầu tool thì chạy tool, gửi kết quả, gọi lại
    let lastText = '';
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await this.llm.createMessage({ system, messages, tools: TOOLS });

      if (response.stop_reason === 'refusal') {
        return { text: HANDOFF_REPLY, handoff: true, reason: 'Model từ chối trả lời', sources };
      }

      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (text) lastText = text;

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        return { text: lastText, handoff: false, sources };
      }

      const handoff = toolUses.find((t) => t.name === 'handoff_to_human');
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        results.push(await this.runTool(toolUse, conversation.contactId));
      }

      if (handoff) {
        const reason = (handoff.input as { reason?: string }).reason;
        return { text: lastText || HANDOFF_REPLY, handoff: true, reason, sources };
      }

      // Gửi lại NGUYÊN response.content (kể cả thinking block) rồi tới kết quả tool
      messages.push({ role: 'assistant', content: response.content }, { role: 'user', content: results });
    }

    this.logger.warn(`Hội thoại ${conversationId}: vượt quá ${MAX_TOOL_TURNS} lượt tool`);
    return { text: lastText || HANDOFF_REPLY, handoff: !lastText, reason: 'Quá nhiều lượt tool', sources };
  }

  private async runTool(
    toolUse: Anthropic.Beta.BetaToolUseBlock,
    contactId: number,
  ): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const ok = (content: string) => ({ type: 'tool_result' as const, tool_use_id: toolUse.id, content });
    try {
      switch (toolUse.name) {
        case 'handoff_to_human':
          return ok('Đã chuyển cho nhân viên.');
        case 'save_contact_info': {
          const { name, phone, email } = toolUse.input as { name?: string; phone?: string; email?: string };
          await this.contacts.update(contactId, { name, phone, email });
          return ok('Đã lưu thông tin liên hệ.');
        }
        default:
          return { ...ok(`Tool không tồn tại: ${toolUse.name}`), is_error: true };
      }
    } catch (err) {
      return { ...ok(`Lỗi: ${(err as Error).message}`), is_error: true };
    }
  }
}

// DB -> định dạng Claude: khách = "user", bot/nhân viên = "assistant"
function toClaudeMessages(history: Message[]): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({
    role: m.role === 'CUSTOMER' ? 'user' : 'assistant',
    content: m.content,
  }));
  // Claude yêu cầu tin đầu tiên là của user
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return messages;
}
