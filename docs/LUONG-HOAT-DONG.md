# Luồng hoạt động của hệ thống — đọc từ đầu đến cuối

File này kể lại **hệ thống chạy như thế nào, theo đúng thứ tự**, kèm theo **file nào, hàm nào** đang làm việc ở mỗi bước.
Đọc lần lượt từ phần 0 đến phần 6. Mở file code bên cạnh để đối chiếu.

---

## Phần 0. Hình dung bằng một cửa hàng

Tưởng tượng hệ thống là một cửa hàng có quầy tư vấn:

| Trong cửa hàng | Trong hệ thống | File |
|---|---|---|
| Bưu tá mang thư của khách tới | Facebook / Zalo gọi **webhook** | `webhooks/webhooks.controller.ts` |
| Người phiên dịch: thư tiếng Facebook, tiếng Zalo → dịch về một mẫu chung | **Adapter** của từng kênh | `channels/adapters/*.adapter.ts` |
| Lễ tân: ghi thư vào sổ, đặt phiếu vào khay "chờ trả lời" | **InboundService** | `webhooks/inbound.service.ts` |
| Cuốn sổ ghi chép | **PostgreSQL** (database) | `prisma/schema.prisma` |
| Khay phiếu chờ xử lý | **Hàng đợi Redis / BullMQ** | `bot/bot-queue.service.ts` |
| Nhân viên tư vấn AI: lấy phiếu, tra tài liệu, soạn thư trả lời | **BotReplyProcessor + AgentService** | `bot/bot-reply.processor.ts`, `ai/agent.service.ts` |
| Tủ tài liệu của cửa hàng | **Kho kiến thức (RAG)** | `knowledge/knowledge.service.ts` |
| Bảng thông báo trên tường cho nhân viên thật xem | **Socket.IO (realtime)** | `realtime/realtime.gateway.ts` |
| Nhân viên thật ngồi ở quầy | **Dashboard Next.js** | `frontend/app/page.js` |

**Ý chính:** Lễ tân chỉ ghi sổ rồi trả lời bưu tá "đã nhận" **ngay lập tức**. Việc soạn câu trả lời (chậm, vài giây) để nhân viên AI làm sau. Vì vậy mới cần cái "khay chờ" (hàng đợi).

---

## Phần 1. Những thứ phải chạy

```
 ┌──────────────── Máy của bạn ────────────────┐         ┌──── Internet ─────┐
 │                                             │         │                   │
 │  Docker:  [PostgreSQL :5432]  [Redis :6379] │         │  Claude API (AI)  │
 │                 ▲                 ▲         │         │  Voyage API       │
 │                 │                 │         │ ◀─────▶ │  (embedding)      │
 │  Backend NestJS :4000  ───────────┘         │         │  Facebook / Zalo  │
 │      (API + webhook + bot + socket)         │         │                   │
 │                 ▲                           │         └───────────────────┘
 │                 │ HTTP + Socket.IO          │
 │  Frontend Next.js :3000  ◀── trình duyệt    │
 └─────────────────────────────────────────────┘
```

- **PostgreSQL** lưu mọi thứ: khách, hội thoại, tin nhắn, tài liệu, vector.
- **Redis** giữ hàng đợi job "cần bot trả lời".
- **Backend** là **một** chương trình duy nhất, bên trong làm 4 việc: nhận API, nhận webhook, chạy bot nền, đẩy realtime.
- **Frontend** là giao diện cho nhân viên.

---

## Phần 2. Khi bạn gõ `npm run start:dev` — hệ thống khởi động

Mọi thứ **bắt đầu từ `backend/src/main.ts`**:

```
main.ts → bootstrap()
  │
  ├─ 1. NestFactory.create(AppModule, { rawBody: true })
  │      Nest đọc app.module.ts và khởi tạo LẦN LƯỢT từng module trong mảng imports:
  │
  │      ConfigModule      → đọc file .env vào bộ nhớ (config/configuration.ts)
  │      BullModule        → kết nối Redis
  │      PrismaModule      → kết nối PostgreSQL (prisma.service.ts → onModuleInit)
  │      RealtimeModule    → mở cổng Socket.IO
  │      AuthModule        → cài AuthGuard "chặn cửa" cho mọi request
  │      UsersModule       → onModuleInit(): DB chưa có user nào? → tạo tài khoản admin từ .env
  │      ChannelsModule    → tạo 3 adapter: Messenger, Zalo, Web
  │      ContactsModule, ConversationsModule, SettingsModule
  │      KnowledgeModule   → onModuleInit(): tạo chỉ mục tìm kiếm vector (nếu chưa có)
  │      AiModule          → tạo kết nối tới Claude
  │      BotModule         → BotReplyProcessor BẮT ĐẦU NGHE hàng đợi 'bot-replies'
  │      WebhooksModule    → mở các đường /webhooks/...
  │
  ├─ 2. enableCors()          → cho phép frontend (cổng 3000) gọi sang
  ├─ 3. ValidationPipe        → tự kiểm tra dữ liệu gửi lên
  ├─ 4. Swagger               → trang tài liệu API ở /docs
  └─ 5. app.listen(4000)      → SẴN SÀNG. Từ giờ hệ thống chỉ ngồi chờ sự kiện.
```

Sau bước 5, backend **không tự làm gì cả**. Nó chỉ phản ứng khi có một trong 3 loại sự kiện:
1. **Khách nhắn tin** → Phần 3
2. **Nhân viên thao tác trên dashboard** → Phần 4
3. **Nạp tài liệu vào kho kiến thức** → Phần 5

---

## Phần 3. Hành trình của MỘT tin nhắn (phần quan trọng nhất)

Ví dụ: khách **Nguyễn An** nhắn vào Fanpage: *"Shop ơi ship ra Hà Nội bao nhiêu?"*

### Giai đoạn A — Nhận tin (diễn ra trong < 1 giây)

**Bước A1. Facebook gọi vào backend**

Facebook gửi `POST http://<server>/webhooks/messenger` với nội dung:
```json
{
  "object": "page",
  "entry": [{
    "messaging": [{
      "sender": { "id": "6789" },
      "message": { "mid": "m_abc123", "text": "Shop ơi ship ra Hà Nội bao nhiêu?" }
    }]
  }]
}
```

**Bước A2. Qua cửa bảo vệ** — `auth/auth.guard.ts` → `canActivate()`

Mọi request đều phải qua đây trước. Controller webhook có gắn `@Public()` nên được cho qua mà không cần đăng nhập.

**Bước A3. Controller nhận** — `webhooks/webhooks.controller.ts` → `messenger()` → `handleChannel('MESSENGER', req)`

**Bước A4. Kiểm tra thư có thật từ Facebook không** — `messenger.adapter.ts` → `verifySignature()`

Facebook ký lên nội dung bằng App Secret. Mình tính lại chữ ký, nếu không khớp → trả `403`, dừng.
(Nếu chưa điền `MESSENGER_APP_SECRET` trong .env thì bỏ qua bước này — chỉ dùng khi dev.)

**Bước A5. "Phiên dịch" về mẫu chung** — `messenger.adapter.ts` → `parse()`

JSON phức tạp của Facebook được rút gọn thành:
```js
{
  channel: 'MESSENGER',
  externalUserId: '6789',          // ID khách do Facebook cấp
  text: 'Shop ơi ship ra Hà Nội bao nhiêu?',
  externalMessageId: 'm_abc123'    // ID tin, dùng để chống lưu trùng
}
```
👉 **Từ đây trở đi, hệ thống không còn quan tâm tin đến từ Facebook hay Zalo nữa.** Zalo cũng được `zalo.adapter.ts` dịch về đúng mẫu này.

**Bước A6. Lễ tân ghi sổ** — `webhooks/inbound.service.ts` → `handle()`

Hàm này làm 4 việc theo thứ tự:

```
handle(tin_nhắn_chuẩn)
  │
  ├─ ① contacts.findOrCreate()              (contacts/contacts.service.ts)
  │     Khách '6789' đã có trong bảng contacts chưa?
  │       Có  → lấy ra.
  │       Chưa → hỏi Facebook tên + ảnh đại diện (adapter.getProfile) → tạo mới:
  │              contacts: { id: 1, channel: MESSENGER, externalId: '6789', name: 'Nguyễn An' }
  │
  ├─ ② conversations.findOrCreateOpen()     (conversations/conversations.service.ts)
  │     Khách này có hội thoại nào đang MỞ không?
  │       Có  → dùng tiếp.
  │       Chưa → tạo mới: conversations: { id: 5, contactId: 1, handledBy: BOT, status: OPEN }
  │
  ├─ ③ conversations.addMessage(role: CUSTOMER)
  │     Lưu tin: messages: { id: 42, conversationId: 5, role: CUSTOMER, content: 'Shop ơi...' }
  │     → realtime.emitMessage()  ➜ dashboard của nhân viên HIỆN TIN NGAY
  │     (Nếu Facebook gửi lại cùng tin m_abc123 lần 2 → bị chặn trùng → dừng tại đây)
  │
  └─ ④ Hội thoại đang do BOT xử lý?
        Có    → botQueue.enqueueReply({ conversationId: 5, messageId: 42 })  (bot/bot-queue.service.ts)
                Đặt 1 job vào Redis, hẹn 2,5 giây sau mới xử lý.
        Không → (nhân viên đang tiếp quản) không làm gì, chờ người trả lời.
```

**Bước A7. Trả lời Facebook "đã nhận"** — controller trả `200 EVENT_RECEIVED`.

Facebook hài lòng, không gửi lại. **Giai đoạn A kết thúc.** Lúc này khách chưa nhận được câu trả lời nào.

---

### Giai đoạn B — Bot suy nghĩ và trả lời (chạy nền, 3–15 giây)

> **Vì sao chờ 2,5 giây?** Khách hay gõ liên tiếp: "alo" → "shop ơi" → "ship HN bao nhiêu". Mỗi tin tạo 1 job, nhưng chỉ job của **tin cuối cùng** được xử lý (xem B2). Kết quả: bot trả lời **một lần** cho cả cụm, thay vì 3 lần.

**Bước B1. Lấy job ra** — `bot/bot-reply.processor.ts` → `process(job)`

BullMQ tự gọi hàm này khi hết 2,5 giây. Dữ liệu job: `{ conversationId: 5, messageId: 42 }`.

**Bước B2. Ba câu hỏi kiểm tra trước khi làm**
```
botShouldReply(5)?
  - Cài đặt: bot có đang BẬT không?            (settings.service.ts)
  - Hội thoại 5 vẫn do BOT xử lý?              (nhân viên có thể vừa bấm "Tiếp quản")
  - Hội thoại 5 vẫn đang MỞ?
  → Sai bất kỳ điều nào: bỏ qua job.

Tin 42 có phải tin MỚI NHẤT của khách không?
  → Không: bỏ qua (job của tin mới hơn sẽ trả lời thay).
```

**Bước B3. Giao cho AI soạn trả lời** — `ai/agent.service.ts` → `generateReply(5)`

Đây là "bộ não". Bên trong làm 3 việc:

```
generateReply(5)
  │
  ├─ ① LẤY NGỮ CẢNH
  │     history = 20 tin gần nhất của hội thoại 5
  │
  ├─ ② TRA TÀI LIỆU (RAG)                       knowledge/knowledge.service.ts → search()
  │     câu hỏi = 3 tin gần nhất của khách ghép lại
  │       → embeddings.service.ts: gửi câu hỏi lên Voyage → nhận về 1 vector (1024 con số)
  │       → SQL: tìm 5 đoạn tài liệu có vector GẦN NHẤT trong bảng chunks
  │     Kết quả ví dụ:
  │       [ { title: 'Chính sách giao hàng', content: 'Nội thành HN 20k, ngoại thành 35k...', similarity: 0.82 },
  │         { title: 'FAQ', content: '...', similarity: 0.61 }, ... ]
  │
  └─ ③ HỎI CLAUDE                               ai/llm.service.ts → createMessage()
        Gửi lên Claude 3 thứ:
          system   = "bản mô tả công việc" (ai/prompts.ts → buildSystemPrompt)
                     gồm: tên cửa hàng, quy tắc trả lời, hướng dẫn từ trang Cài đặt,
                          + 5 đoạn tài liệu vừa tìm được
          messages = 20 tin lịch sử (khách = "user", bot/nhân viên = "assistant")
          tools    = 2 hành động bot được phép yêu cầu:
                     handoff_to_human   (chuyển cho người thật)
                     save_contact_info  (lưu SĐT/email khách)
```

**Bước B4. Claude trả về — có 3 khả năng**

```
                     Claude trả lời
                          │
        ┌─────────────────┼──────────────────────────┐
        ▼                 ▼                          ▼
  (a) Chỉ có chữ     (b) Yêu cầu tool              (c) Yêu cầu tool
                         save_contact_info             handoff_to_human
        │                 │                          │
        │           runTool(): lưu SĐT vào contact   │
        │           gửi kết quả "Đã lưu" lại Claude  │
        │           → Claude trả lời tiếp            │
        │             (quay lại đầu, tối đa 4 vòng)  │
        ▼                                            ▼
  { text: "Dạ ship ra HN là 20k ạ",          { text: "Dạ em chuyển nhân viên...",
    handoff: false }                            handoff: true, reason: "khách muốn chốt đơn" }
```

Vòng lặp "gọi Claude → chạy tool → gọi lại Claude" chính là thứ người ta gọi là **AI Agent**.

**Bước B5. Gửi trả lời cho khách** — quay lại `bot-reply.processor.ts`
```
  - Kiểm tra lại lần nữa: nhân viên có vừa tiếp quản trong lúc AI đang nghĩ không? → có thì bỏ.
  - adapter.sendText('6789', 'Dạ ship ra HN là 20k ạ')   → messenger.adapter.ts gọi Graph API của Facebook
                                                           → KHÁCH NHẬN ĐƯỢC TIN TRÊN MESSENGER ✅
  - addMessage(role: BOT, metadata: { sources: [...] })  → lưu DB + dashboard hiện tin bot
  - Nếu handoff = true:
      conversations.update(handledBy: HUMAN, handoffReason: '...')
      → dashboard hiện "Bot chuyển cho người: ..." ở tab "Cần người"
```

**Nếu có lỗi** (Claude quá tải, mạng chập chờn...): BullMQ tự chạy lại job, tối đa 3 lần, mỗi lần chờ lâu hơn.

### Tóm tắt Phần 3 trên một hình

```
Facebook ─POST─▶ WebhooksController ─▶ Adapter.verify + parse ─▶ InboundService.handle
                                                                   │  lưu contact/conversation/message
                                                                   │  báo dashboard
                                                                   ▼
                                                            Redis (job, chờ 2,5s)
                                                                   │
                                                                   ▼
                                                         BotReplyProcessor.process
                                                                   │  kiểm tra bot bật? tin mới nhất?
                                                                   ▼
                                                         AgentService.generateReply
                                                            │  RAG: tìm 5 đoạn tài liệu
                                                            │  Claude: soạn trả lời / gọi tool
                                                                   ▼
                                       Adapter.sendText ─▶ Facebook ─▶ Khách nhận tin
                                       addMessage(BOT)  ─▶ Dashboard hiện tin
```

---

## Phần 4. Luồng của nhân viên trên dashboard

### 4.1 Đăng nhập
```
Mở http://localhost:3000
  → frontend/lib/auth.js (AuthProvider): trong trình duyệt có token chưa?
      Chưa → chuyển sang /login
  → frontend/app/login/page.js: nhập email + mật khẩu
  → POST /api/auth/login
  → backend auth/auth.service.ts → login():
       tìm user theo email → so mật khẩu (bcrypt) → tạo JWT token
  → frontend lưu token vào localStorage
```

**Token là gì?** Một "thẻ ra vào". Từ đây, mỗi lần frontend gọi API, `frontend/lib/api.js` tự gắn thẻ vào header `Authorization: Bearer <token>`. Ở backend, `auth.guard.ts` kiểm tra thẻ. Thẻ giả hoặc hết hạn → trả `401` → frontend tự đẩy về trang đăng nhập.

### 4.2 Mở hộp thư và nhận tin realtime
```
frontend/app/page.js
  ├─ GET /api/conversations           → danh sách hội thoại
  └─ frontend/lib/socket.js: mở kết nối Socket.IO, gửi kèm token
        → backend realtime.gateway.ts → handleConnection(): token hợp lệ → cho vào phòng "staff"

Từ giờ, mỗi khi backend gọi realtime.emitMessage(...) (Phần 3, bước A6③ và B5)
  → mọi nhân viên trong phòng "staff" nhận sự kiện 'message:new'
  → page.js thêm tin vào màn hình, không cần tải lại trang.
```

### 4.3 Các nút trên hộp thư
| Nhân viên làm | Frontend gọi | Backend xử lý (`conversations.service.ts`) | Kết quả |
|---|---|---|---|
| Bấm **Tiếp quản** | `PATCH /api/conversations/5 {handledBy:'HUMAN'}` | `update()` | Bot ngừng trả lời hội thoại 5 |
| Bấm **Giao lại bot** | `PATCH ... {handledBy:'BOT'}` | `update()` | Tin tiếp theo của khách bot sẽ trả lời |
| Gõ tin và **Gửi** | `POST /api/conversations/5/messages` | `sendAgentMessage()`: gửi qua adapter → lưu tin AGENT → tự chuyển sang HUMAN và giao cho người gửi | Khách nhận tin của nhân viên |
| Chọn **phân công** | `PATCH ... {assigneeId: 2}` | `update()` | Hiện ở tab "Của tôi" của nhân viên đó |
| Bấm **Đóng** | `PATCH ... {status:'CLOSED'}` | `update()` | Khách nhắn lại → tạo hội thoại MỚI |
| Sửa SĐT/tag ở panel phải | `PATCH /api/contacts/1` | `contacts.service.ts → update()` | Lưu hồ sơ khách |

---

## Phần 5. Luồng nạp kiến thức (để bot "biết" về cửa hàng)

```
frontend/app/knowledge/page.js: dán nội dung FAQ, bấm "Lưu vào kho"
  → POST /api/knowledge { title: 'Chính sách giao hàng', content: '...dài...' }
  → backend knowledge/knowledge.service.ts → addDocument()
      │
      ├─ ① chunking.ts → chunkText(): cắt thành các đoạn ~800 ký tự
      │       'Nội thành HN 20k...' | 'Ngoại tỉnh 35k...' | 'Miễn phí đơn trên 500k...'
      │
      ├─ ② embeddings.service.ts → embed(các đoạn, 'document')
      │       gửi lên Voyage → mỗi đoạn nhận về 1 vector 1024 số
      │
      └─ ③ lưu vào DB:
              documents: { id: 1, title: 'Chính sách giao hàng' }
              chunks:    { documentId: 1, content: 'Nội thành HN 20k...', embedding: [0.012, -0.33, ...] }
                         { documentId: 1, content: 'Ngoại tỉnh 35k...',   embedding: [...] }
```

Khi khách hỏi (Phần 3, bước B3②), câu hỏi cũng được biến thành vector. **Đoạn nào có vector gần với câu hỏi nhất thì đó là đoạn liên quan nhất.** Đó là toàn bộ bí mật của RAG.

Ô **"Thử tìm kiếm"** trên trang này gọi đúng hàm `search()` mà bot dùng. Muốn biết bot sẽ đọc tài liệu nào thì thử ở đây.

---

## Phần 6. Trang "Chat thử" khác gì?

Trang `/simulator` giả làm khách nhắn qua kênh **WEB**:
```
frontend/app/simulator/page.js
  → POST /webhooks/web { userId: 'test-ab12', name: 'Khách thử nghiệm', text: '...' }
  → webhooks.controller.ts → web() → InboundService.handle()   ← GIỐNG HỆT Phần 3 từ bước A6
  → ... bot xử lý y như tin Facebook ...
  → web.adapter.ts → sendText(): KHÔNG gửi đi đâu cả
     (khách web nhận tin qua Socket.IO, phòng "conversation:<id>")
```
Vì đi chung một đường với Facebook/Zalo, **test ở đây chạy được thì kênh thật cũng chạy được** (chỉ còn khác phần adapter).

---

## Phụ lục A. Muốn sửa X thì mở file nào?

| Muốn… | Mở file |
|---|---|
| Đổi giọng điệu, cách xưng hô, quy tắc của bot | `backend/src/ai/prompts.ts` |
| Đổi thông tin cửa hàng, khuyến mãi đang chạy | Trang **Cài đặt** trên dashboard (không cần sửa code) |
| Cho bot làm thêm việc (tra đơn hàng, đặt lịch…) | `backend/src/ai/agent.service.ts` → mảng `TOOLS` + hàm `runTool()` |
| Đổi model AI, mức suy nghĩ | `backend/.env` → `LLM_MODEL`, `LLM_EFFORT` |
| Đổi thời gian chờ gom tin (2,5s) | `backend/src/bot/bot-queue.service.ts` → `DEBOUNCE_MS` |
| Đổi độ dài đoạn cắt tài liệu | `backend/src/knowledge/chunking.ts` |
| Bot đọc bao nhiêu tin lịch sử / bao nhiêu đoạn tài liệu | `agent.service.ts` → `HISTORY_LIMIT`, `search(query, 5)` |
| Thêm cột cho bảng (VD: ngày sinh khách) | `backend/prisma/schema.prisma` → `npm run prisma:migrate` |
| Thêm kênh mới (Telegram…) | Tạo `channels/adapters/telegram.adapter.ts` theo mẫu `channel.interface.ts` |
| Sửa giao diện hộp thư | `frontend/app/page.js`, `frontend/app/globals.css` |

## Phụ lục B. Bot không trả lời — kiểm tra theo thứ tự

1. **Tin có hiện trên Hộp thư không?**
   Không → tin chưa vào được backend: sai URL webhook, ngrok tắt, sai chữ ký (xem log backend có `403` không).
2. **Hội thoại đang là "Bot" hay "Người"?** Là "Người" thì bot cố ý im lặng.
3. **Trang Cài đặt: bot có đang bật?**
4. **Log backend có dòng `❌` hoặc lỗi từ Claude / Voyage không?** Thường do thiếu hoặc sai API key trong `.env`.
5. **Có tin bot trong Hộp thư nhưng khách không nhận được?** Lỗi ở bước gửi: Page Access Token hoặc Zalo token sai / hết hạn.
6. **Bot trả lời sai thông tin?** Dùng "Thử tìm kiếm" ở Kho kiến thức: nếu không tìm ra đoạn đúng → bổ sung hoặc viết lại tài liệu cho rõ.

## Phụ lục C. Thứ tự đọc code đề xuất

1. `backend/prisma/schema.prisma` — hiểu dữ liệu trước: có những bảng gì, liên kết ra sao.
2. `backend/src/main.ts` → `app.module.ts` — app khởi động thế nào.
3. `channels/channel.interface.ts` → `adapters/messenger.adapter.ts` — tin từ ngoài vào trông ra sao.
4. `webhooks/webhooks.controller.ts` → `webhooks/inbound.service.ts` — Giai đoạn A.
5. `bot/bot-queue.service.ts` → `bot/bot-reply.processor.ts` — Giai đoạn B.
6. `ai/agent.service.ts` → `ai/prompts.ts` → `knowledge/knowledge.service.ts` — bộ não + RAG.
7. `conversations/conversations.service.ts` — các thao tác của nhân viên.
8. `frontend/lib/api.js` → `frontend/app/page.js` — phía giao diện.
