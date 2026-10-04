'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, CHANNEL_LABEL } from '@/lib/api';
import { useStaffSocketEvent } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import MessageList from '@/components/MessageList';
import ContactPanel from '@/components/ContactPanel';

// Bộ lọc nhanh của hộp thư
const TABS = [
  { key: 'all', label: 'Đang mở', filters: { status: 'OPEN' } },
  { key: 'human', label: 'Cần người', filters: { status: 'OPEN', handledBy: 'HUMAN' } },
  { key: 'bot', label: 'Bot đang xử lý', filters: { status: 'OPEN', handledBy: 'BOT' } },
  { key: 'mine', label: 'Của tôi', filters: { status: 'OPEN', assignee: 'me' } },
  { key: 'closed', label: 'Đã đóng', filters: { status: 'CLOSED' } },
];

// Hộp thư hợp nhất: mọi tin nhắn từ mọi kênh, cập nhật realtime
export default function InboxPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(TABS[0]);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState('');

  const loadList = useCallback(() => api.listConversations(tab.filters).then(setConversations), [tab]);
  const loadSelected = useCallback(() => {
    if (selectedId) api.getConversation(selectedId).then(setSelected);
  }, [selectedId]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { api.listUsers().then(setUsers); }, []);
  useEffect(() => {
    if (!selectedId) return;
    loadSelected();
    api.getMessages(selectedId).then(setMessages);
  }, [selectedId, loadSelected]);

  useStaffSocketEvent('message:new', useCallback(({ conversationId, message }) => {
    if (conversationId === selectedId) {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    }
    loadList();
  }, [selectedId, loadList]));

  useStaffSocketEvent('conversation:updated', useCallback(({ conversation }) => {
    loadList();
    if (conversation?.id === selectedId) loadSelected();
  }, [selectedId, loadList, loadSelected]));

  async function send() {
    if (!draft.trim()) return;
    try {
      await api.sendAgentMessage(selectedId, draft);
      setDraft('');
    } catch (e) {
      alert(e.message);
    }
  }

  const update = (data) => api.updateConversation(selectedId, data).then(setSelected).then(loadList);

  return (
    <div className="inbox">
      <div className="panel conv-list">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={t.key === tab.key ? '' : 'secondary'} onClick={() => setTab(t)}>{t.label}</button>
          ))}
        </div>
        {conversations.length === 0 && <p className="muted" style={{ padding: 12 }}>Không có hội thoại. Thử trang “Chat thử”.</p>}
        {conversations.map((c) => (
          <div key={c.id} className={`conv-item ${c.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(c.id)}>
            <div>
              <strong>{c.contact.name || c.contact.externalId}</strong>
              <span className="badge">{CHANNEL_LABEL[c.channel]}</span>
              <span className={`badge ${c.handledBy.toLowerCase()}`}>{c.handledBy === 'BOT' ? 'Bot' : 'Người'}</span>
            </div>
            <div className="muted">{c.messages[0]?.content.slice(0, 60)}</div>
            {c.assignee && <div className="muted">→ {c.assignee.name}</div>}
          </div>
        ))}
      </div>

      <div className="panel chat">
        {!selected ? (
          <p className="muted">Chọn một hội thoại</p>
        ) : (
          <>
            <div className="chat-header">
              <div>
                <strong>{selected.contact.name || selected.contact.externalId}</strong>
                <div className="muted">
                  {selected.handledBy === 'BOT' ? '🤖 Bot đang tự động trả lời' : '👤 Nhân viên đang xử lý — bot tạm dừng'}
                </div>
              </div>
              <div className="actions">
                <select
                  value={selected.assigneeId ?? ''}
                  onChange={(e) => update({ assigneeId: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">— Chưa phân công —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === user?.id ? ' (tôi)' : ''}</option>)}
                </select>
                <button className="secondary" onClick={() => update({ handledBy: selected.handledBy === 'BOT' ? 'HUMAN' : 'BOT' })}>
                  {selected.handledBy === 'BOT' ? 'Tiếp quản' : 'Giao lại bot'}
                </button>
                <button className="secondary" onClick={() => update({ status: selected.status === 'OPEN' ? 'CLOSED' : 'OPEN' })}>
                  {selected.status === 'OPEN' ? 'Đóng' : 'Mở lại'}
                </button>
              </div>
            </div>
            {selected.handoffReason && selected.handledBy === 'HUMAN' && (
              <div className="alert">Bot chuyển cho người: {selected.handoffReason}</div>
            )}
            <MessageList messages={messages} showSources />
            <div className="composer">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Nhân viên trả lời... (gửi tin sẽ tự tiếp quản)"
              />
              <button onClick={send}>Gửi</button>
            </div>
          </>
        )}
      </div>

      {selected && <ContactPanel contact={selected.contact} onSaved={loadSelected} />}
    </div>
  );
}
