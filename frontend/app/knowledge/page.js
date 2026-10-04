'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

// Quản lý kho kiến thức mà bot dùng để trả lời (RAG)
export default function KnowledgePage() {
  const [documents, setDocuments] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.listDocuments().then(setDocuments);
  useEffect(() => { load(); }, []);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const addText = () => run(async () => {
    await api.addDocument(title, content);
    setTitle('');
    setContent('');
  });

  const upload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) run(() => api.uploadDocument(file));
  };

  return (
    <div className="stack">
      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Thêm tài liệu</h3>
        <p className="muted">FAQ, bảng giá, chính sách đổi trả, giờ mở cửa... Hệ thống sẽ cắt nhỏ và tạo embedding.</p>
        <input placeholder="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea rows={10} placeholder="Nội dung" value={content} onChange={(e) => setContent(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={addText} disabled={busy || !title || !content}>{busy ? 'Đang xử lý...' : 'Lưu vào kho'}</button>
          <span className="muted">hoặc tải file .txt / .md:</span>
          <input type="file" accept=".txt,.md" onChange={upload} disabled={busy} style={{ width: 'auto' }} />
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Thử tìm kiếm (RAG)</h3>
        <p className="muted">Gõ câu hỏi như khách hàng để xem bot sẽ “đọc” những đoạn nào trước khi trả lời.</p>
        <div className="composer" style={{ border: 0, padding: 0 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="VD: phí ship ra Hà Nội bao nhiêu?" />
          <button onClick={() => api.searchKnowledge(query).then(setResults).catch((e) => setError(e.message))}>Tìm</button>
        </div>
        {results.map((r) => (
          <div key={r.id} className="panel">
            <div className="muted">{r.title} · độ liên quan {r.similarity.toFixed(3)}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{r.content}</div>
          </div>
        ))}
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Tài liệu đã có ({documents.length})</h3>
        {documents.map((d) => (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{d.title} <span className="muted">· {d._count.chunks} đoạn</span></span>
            <button className="secondary" onClick={() => run(() => api.deleteDocument(d.id))}>Xoá</button>
          </div>
        ))}
      </div>
    </div>
  );
}
