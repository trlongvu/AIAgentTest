// Gom toàn bộ biến môi trường vào một object có cấu trúc.
// Dùng: configService.get<string>('anthropic.model')
export default () => ({
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@example.com',
    password: process.env.ADMIN_PASSWORD ?? 'admin123',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.LLM_MODEL ?? 'claude-opus-5-5',
    effort: process.env.LLM_EFFORT ?? 'low',
  },
  voyage: {
    apiKey: process.env.VOYAGE_API_KEY,
    model: process.env.EMBEDDING_MODEL ?? 'voyage-3.5',
  },

  messenger: {
    verifyToken: process.env.MESSENGER_VERIFY_TOKEN,
    appSecret: process.env.MESSENGER_APP_SECRET,
    pageAccessToken: process.env.MESSENGER_PAGE_ACCESS_TOKEN,
    graphVersion: process.env.MESSENGER_GRAPH_VERSION ?? 'v21.0',
  },
  zalo: {
    appId: process.env.ZALO_APP_ID,
    oaSecretKey: process.env.ZALO_OA_SECRET_KEY,
    accessToken: process.env.ZALO_OA_ACCESS_TOKEN,
  },
});
