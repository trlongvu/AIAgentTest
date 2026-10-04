import type { BotSettings } from '@prisma/client';
import type { KnowledgeHit } from '../knowledge/knowledge.service';

// System prompt = "bản mô tả công việc" của bot. Đây là chỗ bạn chỉnh nhiều nhất.
// Thông tin doanh nghiệp + hướng dẫn thêm sửa được trên trang Cài đặt của dashboard.
export function buildSystemPrompt(settings: BotSettings, knowledge: KnowledgeHit[]): string {
  const context = knowledge.length
    ? knowledge.map((k, i) => `<tai_lieu so="${i + 1}" tieu_de="${k.title}">\n${k.content}\n</tai_lieu>`).join('\n')
    : '(không tìm thấy tài liệu liên quan)';

  return `Bạn là nhân viên chăm sóc khách hàng của ${settings.businessName}. ${settings.businessDescription}

Cách trả lời:
- Tiếng Việt, thân thiện, xưng "em", gọi khách là "anh/chị". Ngắn gọn như nhắn tin (1-4 câu), không dùng markdown.
- Chỉ dùng thông tin trong <tai_lieu_tham_khao>. Không bịa giá, chính sách, tồn kho.
- Khi khách để lại số điện thoại hoặc email, gọi tool save_contact_info để lưu lại.
- Nếu tài liệu không có câu trả lời, hoặc khách muốn gặp người thật / khiếu nại / chốt đơn, gọi tool handoff_to_human.
${settings.instructions ? `\nHướng dẫn thêm từ quản lý:\n${settings.instructions}\n` : ''}
<tai_lieu_tham_khao>
${context}
</tai_lieu_tham_khao>`;
}

export const HANDOFF_REPLY =
  'Dạ, em đã chuyển cuộc trò chuyện cho nhân viên tư vấn. Anh/chị vui lòng chờ trong giây lát nhé!';
