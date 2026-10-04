'use client';

import { useEffect, useState } from 'react';
import { api, CHANNEL_LABEL } from '@/lib/api';

// Danh sách khách hàng (CRM): tìm theo tên/SĐT/email, lọc theo tag, kênh
export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [channel, setChannel] = useState('');

  useEffect(() => {
    const t = setTimeout(() => api.listContacts({ q, tag, channel }).then(setContacts), 300);
    return () => clearTimeout(t);
  }, [q, tag, channel]);

  return (
    <div className="stack" style={{ maxWidth: 1100 }}>
      <div className="panel filters">
        <input placeholder="Tìm tên, SĐT, email..." value={q} onChange={(e) => setQ(e.target.value)} />
        <input placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Mọi kênh</option>
          {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr><th>Tên</th><th>Kênh</th><th>SĐT</th><th>Email</th><th>Tag</th><th>Hội thoại</th><th>Cập nhật</th></tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>{c.name || <span className="muted">{c.externalId}</span>}</td>
                <td>{CHANNEL_LABEL[c.channel]}</td>
                <td>{c.phone}</td>
                <td>{c.email}</td>
                <td>{c.tags.map((t) => <span key={t} className="badge">{t}</span>)}</td>
                <td>{c._count.conversations}</td>
                <td className="muted">{new Date(c.updatedAt).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length === 0 && <p className="muted">Chưa có khách hàng nào.</p>}
      </div>
    </div>
  );
}
