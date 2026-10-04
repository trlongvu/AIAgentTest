import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Effort = 'low' | 'medium' | 'high';

// "fallbacks: default" = nếu model từ chối vì bộ lọc an toàn, API tự chạy lại bằng
// model dự phòng phù hợp ngay trong cùng request.
const FALLBACK_PARAMS = { fallbacks: 'default' } as const;

@Injectable()
export class LlmService {
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.get<string>('anthropic.apiKey') });
  }

  createMessage(params: {
    system: string;
    messages: Anthropic.Beta.BetaMessageParam[];
    tools: Anthropic.Beta.BetaTool[];
  }) {
    return this.client.beta.messages.create({
      model: this.config.get<string>('anthropic.model')!,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      ...FALLBACK_PARAMS,
      output_config: { effort: this.config.get<Effort>('anthropic.effort') },
      ...params,
    });
  }
}
