export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'crm_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// Gọi API backend, tự gắn JWT. Hết hạn đăng nhập (401) -> về trang /login
async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Phiên đăng nhập đã hết hạn');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new Error(message ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),

  listConversations: (filters = {}) => request(`/api/conversations${qs(filters)}`),
  getConversation: (id) => request(`/api/conversations/${id}`),
  getMessages: (id) => request(`/api/conversations/${id}/messages`),
  sendAgentMessage: (id, content) => request(`/api/conversations/${id}/messages`, { method: 'POST', body: { content } }),
  updateConversation: (id, data) => request(`/api/conversations/${id}`, { method: 'PATCH', body: data }),

  listContacts: (filters = {}) => request(`/api/contacts${qs(filters)}`),
  updateContact: (id, data) => request(`/api/contacts/${id}`, { method: 'PATCH', body: data }),

  listDocuments: () => request('/api/knowledge'),
  addDocument: (title, content) => request('/api/knowledge', { method: 'POST', body: { title, content } }),
  uploadDocument: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/knowledge/upload', { method: 'POST', form });
  },
  deleteDocument: (id) => request(`/api/knowledge/${id}`, { method: 'DELETE' }),
  searchKnowledge: (query) => request('/api/knowledge/search', { method: 'POST', body: { query } }),

  getSettings: () => request('/api/settings'),
  updateSettings: (data) => request('/api/settings', { method: 'PUT', body: data }),

  listUsers: () => request('/api/users'),
  createUser: (data) => request('/api/users', { method: 'POST', body: data }),

  // Kênh web công khai (trang Chat thử) — không cần đăng nhập
  sendWebMessage: (userId, name, text) => request('/webhooks/web', { method: 'POST', body: { userId, name, text } }),
};

export const CHANNEL_LABEL = { MESSENGER: 'Messenger', ZALO: 'Zalo', WEB: 'Web' };
