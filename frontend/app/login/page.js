'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel stack" style={{ maxWidth: 360, margin: '80px auto' }}>
      <h2 style={{ margin: 0 }}>Đăng nhập AI CRM</h2>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="error">{error}</p>}
      <button disabled={loading}>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
      <p className="muted">Lần đầu: dùng ADMIN_EMAIL / ADMIN_PASSWORD trong backend/.env</p>
    </form>
  );
}
