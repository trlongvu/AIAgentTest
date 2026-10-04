'use client';

import { useEffect, useRef } from 'react';

const ROLE_LABEL = { CUSTOMER: 'Khách', BOT: '🤖 Bot', AGENT: '👤 Nhân viên' };

export default function MessageList({ messages, showSources = false }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages">
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.role.toLowerCase()}`}>
          <span className="role">
            {m.role === 'AGENT' && m.sender?.name ? `👤 ${m.sender.name}` : ROLE_LABEL[m.role]}
          </span>
          {m.content}
          {/* Cho nhân viên thấy bot đã dựa vào tài liệu nào để trả lời */}
          {showSources && m.metadata?.sources?.length > 0 && (
            <span className="sources">
              Nguồn: {m.metadata.sources.map((s) => `${s.title} (${s.similarity.toFixed(2)})`).join(', ')}
            </span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
