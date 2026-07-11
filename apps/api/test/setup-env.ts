// Loaded before every Jest test file. Points the app at a dedicated test
// database/Redis DB so specs never touch dev data, and fills required env
// vars that would otherwise fail loadEnv()'s validation.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://novamail:novamail@localhost:5432/novamail_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1";
process.env.TOKEN_ENCRYPTION_KEY =
  "2d498dee3493b502e0477c044a885c16f9e15f0ec26f928ccddd04c56c4c402f".slice(0, 64);
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";
process.env.MICROSOFT_CLIENT_ID = "";
process.env.MICROSOFT_CLIENT_SECRET = "";
process.env.OPENAI_API_KEY = "";
