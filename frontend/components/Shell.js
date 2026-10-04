'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';

const LINKS = [
  { href: '/', label: 'Hộp thư' },
  { href: '/contacts', label: 'Khách hàng' },
  { href: '/knowledge', label: 'Kho kiến thức' },
  { href: '/settings', label: 'Cài đặt' },
  { href: '/simulator', label: 'Chat thử' },
];

function Nav() {
  const pathname = usePathname();
  const auth = useAuth();
  if (pathname === '/login') return null;

  return (
    <nav className="nav">
      <strong>AI CRM</strong>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : ''}>{l.label}</Link>
      ))}
      <span style={{ flex: 1 }} />
      {auth?.user && (
        <>
          <span className="muted">{auth.user.name} · {auth.user.role}</span>
          <button className="secondary" onClick={auth.logout}>Đăng xuất</button>
        </>
      )}
    </nav>
  );
}

export default function Shell({ children }) {
  return (
    <AuthProvider>
      <Nav />
      <main>{children}</main>
    </AuthProvider>
  );
}
