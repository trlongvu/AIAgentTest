'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'AGENT' });
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.listUsers().then(setUsers);
  }, []);

  if (!settings) return null;
  const set = (key) => (e) => setSettings({ ...settings, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function saveSettings() {
    const { botEnabled, businessName, businessDescription, instructions } = settings;
    setSettings(await api.updateSettings({ botEnabled, businessName, businessDescription, instructions }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function addUser() {
    setError('');
    try {
      await api.createUser(newUser);
      setNewUser({ name: '', email: '', password: '', role: 'AGENT' });
      setUsers(await api.listUsers());
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Cấu hình bot</h3>
        {!isAdmin && <p className="muted">Chỉ admin được sửa.</p>}
        <label className="row">
          <input type="checkbox" checked={settings.botEnabled} onChange={set('botEnabled')} disabled={!isAdmin} style={{ width: 'auto' }} />
          Bật bot tự động trả lời (tắt = mọi tin chờ nhân viên)
        </label>
        <label>Tên doanh nghiệp<input value={settings.businessName} onChange={set('businessName')} disabled={!isAdmin} /></label>
        <label>Mô tả ngắn<textarea rows={2} value={settings.businessDescription} onChange={set('businessDescription')} disabled={!isAdmin} /></label>
        <label>
          Hướng dẫn thêm cho bot
          <textarea
            rows={6}
            value={settings.instructions}
            onChange={set('instructions')}
            disabled={!isAdmin}
            placeholder={'VD:\n- Đang có khuyến mãi giảm 10% cho đơn trên 500k đến hết tháng.\n- Không hứa thời gian giao hàng cụ thể.'}
          />
        </label>
        {isAdmin && <button onClick={saveSettings}>{saved ? 'Đã lưu ✓' : 'Lưu cấu hình'}</button>}
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Nhân viên ({users.length})</h3>
        {users.map((u) => (
          <div key={u.id}>{u.name} <span className="muted">· {u.email} · {u.role}</span></div>
        ))}
        {isAdmin && (
          <>
            <h4 style={{ marginBottom: 0 }}>Thêm nhân viên</h4>
            <div className="filters">
              <input placeholder="Tên" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              <input placeholder="Mật khẩu (≥6 ký tự)" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="AGENT">Nhân viên</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button onClick={addUser}>Thêm</button>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
