# AI CRM — Trợ lý AI trả lời tin nhắn đa kênh

Hệ thống nhận tin nhắn từ **Facebook Messenger, Zalo OA, website**, dùng **RAG + LLM (Claude)** để tự động trả lời dựa trên kiến thức doanh nghiệp. Nhân viên theo dõi mọi hội thoại trên một hộp thư chung, có thể **tiếp quản**, **phân công**, và quản lý **thông tin khách hàng**.

| Phần | Công nghệ |
|---|---|
| Backend | **NestJS** (TypeScript), Prisma ORM, BullMQ (hàng đợi), Socket.IO (realtime), JWT (đăng nhập), Swagger |
| Cơ sở dữ liệu | PostgreSQL + **pgvector** (lưu vector cho RAG), Redis (hàng đợi) |
| AI | **Claude** (trả lời), **Voyage AI** (embedding cho RAG) |
| Frontend | **Next.js** (App Router) |

```
AIAGent/
├── docker-compose.yml          # PostgreSQL (pgvector) + Redis
├── backend/                    # NestJS
│   ├── prisma/schema.prisma    # Định nghĩa toàn bộ bảng
│   └── src/
│       ├── main.ts             # Khởi động app, Swagger, ValidationPipe
│       ├── app.module.ts       # Lắp ráp các module
│       ├── auth/  users/       # Đăng nhập JWT, nhân viên, phân quyền ADMIN/AGENT
│       ├── channels/           # Adapter cho từng kênh: Messenger, Zalo, Web
│       ├── webhooks/           # Nhận webhook -> InboundService (điểm vào chung)
│       ├── contacts/           # Khách hàng: SĐT, email, tag, ghi chú
│       ├── conversations/      # Hội thoại, tin nhắn, tiếp quản, phân công
│       ├── knowledge/          # Kho kiến thức + RAG (chunking, embedding, tìm kiếm)
│       ├── ai/                 # LLM (Claude), prompt, agent + tools
│       ├── bot/                # Hàng đợi + processor chạy AI ở nền
│       ├── settings/           # Cấu hình bot (sửa trên dashboard)
│       └── realtime/           # Socket.IO gateway
└── frontend/                   # Next.js
    └── app/  login · (hộp thư) · contacts · knowledge · settings · simulator
```

---

## 1. Bức tranh tổng thể

```
  Khách hàng (Messenger / Zalo / Web)
          │ ① nhắn tin
          ▼
  Facebook / Zalo ── ② gọi webhook (HTTP POST) ──┐
                                                 ▼
  ┌──────────────────────────── BACKEND (NestJS) ─────────────────────────────┐
  │                                                                           │
  │  WebhooksController ── ③ xác thực chữ ký, adapter.parse() ──┐             │
  │                                                             ▼             │
  │  InboundService ── ④ lưu Contact/Conversation/Message ──▶ PostgreSQL      │
  │        │             ⑤ báo realtime ─────────────────▶ RealtimeGateway ───┼──▶ Dashboard
  │        │ ⑥ xếp job (trễ 2,5s)                                             │    (Next.js)
  │        ▼                                                                  │
  │  Redis / BullMQ ──▶ BotReplyProcessor (chạy nền)                          │
  │                       ⑦ AgentService:                                     │
  │                          - KnowledgeService.search()  ← RAG (pgvector)    │
  │                          - LlmService → Claude (+ tools)                  │
  │                       ⑧ adapter.sendText() ──────────────────────────────┼──▶ Khách nhận trả lời
  │                       ⑨ lưu tin bot + báo realtime                        │
  └───────────────────────────────────────────────────────────────────────────┘
```

### Vì sao cần hàng đợi (BullMQ)?
- Facebook/Zalo yêu cầu webhook trả lời **trong vài giây**, còn gọi AI có thể mất 3–20 giây. Nên webhook chỉ lưu tin + xếp job rồi trả `200` ngay; AI chạy ở nền.
- Lỗi khi gọi AI hoặc gửi tin → job **tự thử lại** 3 lần.
- **Gom tin**: khách hay gõ "alo" / "shop ơi" / "còn hàng ko" liên tiếp. Job chờ 2,5s, và chỉ job của tin **mới nhất** được xử lý → bot trả lời một lần cho cả cụm.

### NestJS tổ chức code thế nào?
- **Module** = một nghiệp vụ (contacts, knowledge...). Mỗi module có **Controller** (nhận HTTP) và **Service** (xử lý logic).
- **Dependency Injection**: service khai báo cần gì trong `constructor`, Nest tự đưa vào. Ví dụ `AgentService` cần `LlmService`, `KnowledgeService`...
- **DTO + ValidationPipe**: dữ liệu gửi lên được kiểm tra tự động (`@IsEmail()`, `@IsString()`...), sai thì trả lỗi 400.
- **Guard**: `AuthGuard` chạy trước mọi request, kiểm tra JWT. Route nào gắn `@Public()` thì không cần đăng nhập (webhook, login). `@Roles('ADMIN')` để giới hạn quyền.

---

## 2. Hành trình một tin nhắn — đọc code theo thứ tự này

| # | Việc gì xảy ra | File |
|---|---|---|
| 1 | Facebook gọi `POST /webhooks/messenger` | [webhooks.controller.ts](backend/src/webhooks/webhooks.controller.ts) |
| 2 | Kiểm tra chữ ký HMAC, chuyển JSON của Facebook về **dạng chuẩn** `IncomingMessage` | [messenger.adapter.ts](backend/src/channels/adapters/messenger.adapter.ts) |
| 3 | Tìm/tạo khách (lấy tên + avatar từ Facebook), tìm/tạo hội thoại, lưu tin, xếp job | [inbound.service.ts](backend/src/webhooks/inbound.service.ts) |
| 4 | Processor kiểm tra: bot có bật? nhân viên có đang tiếp quản? có tin mới hơn không? | [bot-reply.processor.ts](backend/src/bot/bot-reply.processor.ts) |
| 5 | **RAG**: tìm 5 đoạn kiến thức gần nghĩa nhất với câu hỏi | [knowledge.service.ts](backend/src/knowledge/knowledge.service.ts) |
| 6 | Ghép **system prompt** = cấu hình bot + kiến thức tìm được | [prompts.ts](backend/src/ai/prompts.ts) |
| 7 | **Vòng lặp agent**: gọi Claude → Claude có thể gọi tool → chạy tool → gọi lại | [agent.service.ts](backend/src/ai/agent.service.ts) |
| 8 | Gửi trả lời qua Graph API, lưu tin (kèm nguồn kiến thức đã dùng), báo realtime | [bot-reply.processor.ts](backend/src/bot/bot-reply.processor.ts) |

Mọi kênh đi chung từ bước 3. Mỗi kênh chỉ cần một **adapter** biết *đọc webhook* và *gửi tin* ([channel.interface.ts](backend/src/channels/channel.interface.ts)).

---

## 3. Các khái niệm AI

**LLM** — Claude đọc hội thoại và viết câu trả lời. Nó không biết gì về cửa hàng của bạn → cần RAG.

**RAG (Retrieval-Augmented Generation)** — "tra cứu trước, trả lời sau":
```
NẠP (trang Kho kiến thức)
  Tài liệu ──cắt đoạn ~800 ký tự──▶ [đoạn 1][đoạn 2]… ──embedding──▶ vector ──▶ bảng chunks

MỖI TIN NHẮN
  3 tin gần nhất của khách ──embedding──▶ vector ──so khoảng cách cosine──▶ 5 đoạn gần nhất ──▶ đưa vào prompt
```
- **Embedding** biến văn bản thành vector 1024 số; câu cùng nghĩa → vector gần nhau ("phí ship" ≈ "tiền vận chuyển").
- **pgvector** giúp PostgreSQL lưu vector và tìm "gần nhất" (toán tử `<=>`), có chỉ mục HNSW cho nhanh.
- Prisma chưa hỗ trợ kiểu `vector` → cột này đọc/ghi bằng SQL thô trong `knowledge.service.ts`.

**Agent & Tools** — Claude được phép *yêu cầu hành động*. Hiện có:
| Tool | Khi nào Claude dùng | Hệ thống làm gì |
|---|---|---|
| `handoff_to_human` | Khách đòi gặp người, khiếu nại, chốt đơn, hoặc không có thông tin | Chuyển hội thoại sang `HUMAN`, hiện lý do trên dashboard |
| `save_contact_info` | Khách để lại tên / SĐT / email | Lưu vào hồ sơ khách hàng |

Thêm tool mới (tra đơn hàng, đặt lịch, tạo đơn...): khai báo trong `TOOLS` và xử lý trong `runTool()` ở [agent.service.ts](backend/src/ai/agent.service.ts).

**Tiếp quản** — mỗi hội thoại có `handledBy = BOT | HUMAN`. Khi `HUMAN`, bot im lặng. Nhân viên gửi tin từ dashboard sẽ tự động tiếp quản và được phân công.

---

## 4. Chạy trên máy

### Cần cài
- **Node.js 20+** — https://nodejs.org (máy bạn hiện chưa có)
- **Docker Desktop** — nhớ mở app trước khi chạy lệnh docker
- API key **Anthropic** (https://console.anthropic.com) và **Voyage AI** (https://www.voyageai.com)

### Các bước
```bash
# 1. Bật PostgreSQL + Redis
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env            # điền ANTHROPIC_API_KEY, VOYAGE_API_KEY, đổi JWT_SECRET
npm install
npm run prisma:migrate          # tạo bảng (lần đầu sẽ hỏi tên migration, gõ "init")
npm run start:dev               # http://localhost:4000 · Swagger: http://localhost:4000/docs

# 3. Frontend (terminal khác)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                     # http://localhost:3000
```

### Thử nghiệm
1. Đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `backend/.env` (tạo tự động lần chạy đầu).
2. **Cài đặt** → điền tên doanh nghiệp, mô tả, hướng dẫn cho bot.
3. **Kho kiến thức** → dán hoặc tải lên FAQ, bảng giá, chính sách... → dùng ô *Thử tìm kiếm* để kiểm tra RAG.
4. **Chat thử** (mở tab ẩn danh cho giống khách thật) → nhắn tin như khách.
5. **Hộp thư** → xem realtime, xem bot dùng nguồn nào, bấm *Tiếp quản*, phân công, sửa thông tin khách bên phải.

Xem/sửa dữ liệu trực tiếp: `npm run prisma:studio`.

---

## 5. Kết nối kênh thật

Facebook/Zalo cần gọi vào máy bạn qua **HTTPS công khai**. Khi dev dùng ngrok: `ngrok http 4000`.

### Facebook Messenger
1. Tạo app tại https://developers.facebook.com → thêm **Messenger** → liên kết Fanpage.
2. **Page Access Token** → `MESSENGER_PAGE_ACCESS_TOKEN`; **App Secret** → `MESSENGER_APP_SECRET`.
3. Webhook: `https://<ngrok>/webhooks/messenger`, Verify Token = `MESSENGER_VERIFY_TOKEN`, đăng ký sự kiện `messages`.
4. Ở chế độ Development chỉ tài khoản có vai trò trong app nhắn được. Lên production cần App Review quyền `pages_messaging`.

### Zalo OA
1. Tạo ứng dụng tại https://developers.zalo.me, liên kết Official Account.
2. Điền `ZALO_APP_ID`, `ZALO_OA_SECRET_KEY`, `ZALO_OA_ACCESS_TOKEN`.
3. Webhook: `https://<ngrok>/webhooks/zalo`, bật sự kiện `user_send_text`.
4. ⚠️ OA access token hết hạn ~25 giờ; công thức chữ ký webhook trong `zalo.adapter.ts` cần đối chiếu tài liệu Zalo hiện hành.

### Thêm kênh khác (Telegram, Instagram, WhatsApp…)
1. Thêm giá trị vào `enum Channel` trong `schema.prisma` → `npm run prisma:migrate`.
2. Tạo `channels/adapters/xxx.adapter.ts` implement `ChannelAdapter`.
3. Đăng ký trong `channels.module.ts` + `channel-registry.service.ts`, thêm route trong `webhooks.controller.ts`.

---

## 6. API chính (đầy đủ tại `/docs`)

| Method | Đường dẫn | Mô tả | Quyền |
|---|---|---|---|
| POST | `/api/auth/login` | Đăng nhập → `accessToken` | công khai |
| GET | `/api/auth/me` | Thông tin tôi | đăng nhập |
| GET/POST | `/api/users` | Danh sách / tạo nhân viên | POST: ADMIN |
| GET | `/api/conversations?status=&handledBy=&channel=&assignee=me` | Hộp thư | đăng nhập |
| GET | `/api/conversations/:id/messages` | Tin nhắn | đăng nhập |
| POST | `/api/conversations/:id/messages` | Nhân viên trả lời | đăng nhập |
| PATCH | `/api/conversations/:id` | `handledBy`, `status`, `assigneeId` | đăng nhập |
| GET/PATCH | `/api/contacts`, `/api/contacts/:id` | Khách hàng | đăng nhập |
| GET/POST/DELETE | `/api/knowledge` | Tài liệu; `POST /upload` (file), `POST /search` | đăng nhập |
| GET/PUT | `/api/settings` | Cấu hình bot | PUT: ADMIN |
| GET/POST | `/webhooks/messenger`, `/webhooks/zalo`, `/webhooks/web` | Webhook các kênh | công khai |

Socket.IO: nhân viên kết nối kèm `auth.token`; sự kiện `message:new`, `conversation:updated`.

---

## 7. Cấu hình AI (`backend/.env`)
- `LLM_MODEL=claude-opus-5-5`, `LLM_EFFORT=low` (chat CSKH thường `low` là đủ nhanh và rẻ; tăng `medium` nếu trả lời chưa tốt).
- Đã bật **fallbacks**: nếu model từ chối vì bộ lọc an toàn, API tự chạy lại bằng model dự phòng — [llm.service.ts](backend/src/ai/llm.service.ts).
- Giọng điệu, quy tắc chung: [prompts.ts](backend/src/ai/prompts.ts). Thông tin riêng của cửa hàng: sửa ở trang **Cài đặt**.

---

## 8. Lộ trình tiếp theo
1. **Nạp PDF/DOCX/website** vào kho kiến thức (hiện nhận .txt/.md và văn bản dán vào).
2. **Refresh token Zalo** tự động; tin nhắn ảnh/sticker/voice.
3. **Thêm tool cho agent**: tra đơn hàng, tạo đơn, đặt lịch (kết nối hệ thống bán hàng của bạn).
4. **Pipeline bán hàng**: trạng thái khách (mới → quan tâm → đã mua), báo cáo số hội thoại, tỷ lệ bot tự xử lý.
5. **Đánh giá bot**: thống kê các lần chuyển người → bổ sung kiến thức còn thiếu.
6. **Mở rộng**: tách processor ra process/worker riêng, thêm Socket.IO Redis adapter khi chạy nhiều instance.
7. **Triển khai**: Docker hoá backend, deploy (VPS / Railway / Render), frontend lên Vercel; viết test (Jest có sẵn trong hệ sinh thái Nest).
