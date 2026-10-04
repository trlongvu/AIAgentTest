'use client';

import { useEffect, useState } from 'react';
import { api, CHANNEL_LABEL } from '@/lib/api';

// Thông tin khách hàng (CRM) bên phải hộp thư: sửa SĐT, email, tag, ghi chú
export default function ContactPanel({ contact, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: contact.name ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      tags: (contact.tags ?? []).join(', '),
      notes: contact.notes ?? '',
    });
  }, [contact]);

  if (!form) return null;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function save() {
    setSaving(true);
    try {
      const updated = await api.updateContact(contact.id, {
        name: form.name || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        notes: form.notes,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onSaved?.(updated);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel stack contact-panel">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {contact.avatarUrl && <img src={contact.avatarUrl} alt="" width={40} height={40} style={{ borderRadius: '50%' }} />}
        <div>
          <strong>{contact.name || contact.externalId}</strong>
          <div className="muted">{CHANNEL_LABEL[contact.channel]} · {contact.externalId}</div>
        </div>
      </div>
      <label>Tên<input value={form.name} onChange={set('name')} /></label>
      <label>Số điện thoại<input value={form.phone} onChange={set('phone')} /></label>
      <label>Email<input value={form.email} onChange={set('email')} /></label>
      <label>Tag (cách nhau dấu phẩy)<input value={form.tags} onChange={set('tags')} placeholder="vip, khách-sỉ" /></label>
      <label>Ghi chú<textarea rows={4} value={form.notes} onChange={set('notes')} /></label>
      <button onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thông tin'}</button>
    </div>
  );
}
