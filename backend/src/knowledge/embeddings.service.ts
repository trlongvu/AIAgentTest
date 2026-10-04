import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Embedding = biến văn bản thành vector số. Hai câu càng gần nghĩa thì vector càng gần nhau.
// Claude không có API embedding nên dùng Voyage AI (đối tác được Anthropic khuyến nghị).
// Muốn đổi nhà cung cấp: chỉ sửa file này + số chiều vector trong schema.prisma.
const BATCH_SIZE = 64;

@Injectable()
export class EmbeddingsService {
  constructor(private readonly config: ConfigService) {}

  /** inputType: 'document' khi lưu kiến thức, 'query' khi tìm theo câu hỏi */
  async embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.get<string>('voyage.apiKey')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: texts.slice(i, i + BATCH_SIZE),
          model: this.config.get<string>('voyage.model'),
          input_type: inputType,
        }),
      });
      if (!res.ok) throw new Error(`Voyage embeddings lỗi ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as { data: { embedding: number[] }[] };
      vectors.push(...json.data.map((d) => d.embedding));
    }
    return vectors;
  }
}
