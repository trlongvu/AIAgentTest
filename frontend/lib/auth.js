'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, getToken, setToken } from './api';
import { resetStaffSocket } from './socket';

const AuthContext = createContext(null);

// Trang không cần đăng nhập
const PUBLIC_PATHS = ['/login', '/simulator'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      if (!isPublic) router.replace('/login');
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, [isPublic, router]);

  async function login(email, password) {
    const { accessToken, user } = await api.login(email, password);
    setToken(accessToken);
    resetStaffSocket();
    setUser(user);
    router.replace('/');
  }

  function logout() {
    setToken(null);
    resetStaffSocket();
    setUser(null);
    router.replace('/login');
  }

  if (!ready && !isPublic) return null;
  if (!isPublic && !user) return null;

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
