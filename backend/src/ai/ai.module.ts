import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SettingsModule } from '../settings/settings.module';
import { AgentService } from './agent.service';
import { LlmService } from './llm.service';

@Module({
  imports: [KnowledgeModule, SettingsModule, ConversationsModule, ContactsModule],
  providers: [LlmService, AgentService],
  exports: [AgentService],
})
export class AiModule {}
