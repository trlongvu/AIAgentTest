'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useCustomerSocket } from '@/lib/socket';
import MessageList from '@/components/MessageList';

// Đóng vai KHÁCH HÀNG nhắn qua kênh WEB — test bot mà chưa cần kết nối Facebook/Zalo.
// Trang này không cần đăng nhập (giống widget chat trên website).
export default function SimulatorPage() {
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('Khách thử nghiệm');
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setUserId(`test-${Math.random().toString(36).slice(2, 8)}`);
  }, []);

  useCustomerSocket(conversationId, useCallback(({ message }) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []));

  async function send() {
    if (!draft.trim()) return;
    const text = draft;
    setDraft('');
    const res = await api.sendWebMessage(userId, name, text);
    setConversationId(res.conversationId);
    if (res.message) {
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
    }
  }

  return (
    <div className="panel chat" style={{ maxWidth: 600, height: 'calc(100vh - 90px)', margin: '0 auto' }}>
      <div className="chat-header">
        <div>
          <strong>Chat thử với bot</strong>
          <div className="muted">Mã khách: {userId}</div>
        </div>
        <input style={{ width: 200 }} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <MessageList messages={messages} />
      <div className="composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Nhập tin nhắn như khách hàng..."
        />
        <button onClick={send}>Gửi</button>
      </div>
    </div>
  );
}
