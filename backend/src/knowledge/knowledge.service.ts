import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { chunkText } from './chunking';
import { EmbeddingsService } from './embeddings.service';

export interface KnowledgeHit {
  id: number;
  content: string;
  title: string;
  similarity: number; // 1 = giống hệt, 0 = không liên quan
}

const toVector = (values: number[]) => `[${values.join(',')}]`;

// RAG gồm 2 pha:
//  1. Nạp: tài liệu -> cắt đoạn -> embedding -> lưu bảng chunks
//  2. Truy xuất: câu hỏi -> embedding -> tìm các đoạn gần nghĩa nhất -> đưa vào prompt
@Injectable()
export class KnowledgeService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  // Chỉ mục HNSW giúp tìm vector gần nhất nhanh khi dữ liệu lớn (Prisma chưa khai báo được trong schema)
  async onModuleInit() {
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)',
    );
  }

  async addDocument(title: string, content: string) {
    const pieces = chunkText(content);
    if (pieces.length === 0) throw new BadRequestException('Tài liệu rỗng');
    const vectors = await this.embeddings.embed(pieces, 'document');

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({ data: { title } });
      for (let i = 0; i < pieces.length; i++) {
        // Cột vector không có trong Prisma Client -> dùng SQL thô (tham số hoá, an toàn SQL injection)
        await tx.$executeRaw`
          INSERT INTO chunks ("documentId", content, embedding)
          VALUES (${doc.id}, ${pieces[i]}, ${toVector(vectors[i])}::vector)`;
      }
      return { ...doc, chunkCount: pieces.length };
    });
  }

  async search(text: string, k = 5): Promise<KnowledgeHit[]> {
    if (!text?.trim()) return [];
    const [vector] = await this.embeddings.embed([text], 'query');
    const literal = toVector(vector);
    const rows = await this.prisma.$queryRaw<KnowledgeHit[]>`
      SELECT c.id, c.content, d.title, 1 - (c.embedding <=> ${literal}::vector) AS similarity
      FROM chunks c JOIN documents d ON d.id = c."documentId"
      ORDER BY c.embedding <=> ${literal}::vector
      LIMIT ${k}`;
    return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
  }

  list() {
    return this.prisma.document.findMany({
      orderBy: { id: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });
  }

  async remove(id: number) {
    await this.prisma.document.delete({ where: { id } });
  }
}
