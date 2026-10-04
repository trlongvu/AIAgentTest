import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService, EmbeddingsService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
