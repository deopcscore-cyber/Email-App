import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { API_PREFIX } from "@novamail/shared";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { loadEnv } from "./config/env";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(API_PREFIX.slice(1)); // Nest wants it without leading /
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  // The web app proxies /api/* to us, so requests are same-origin in the
  // browser; CORS stays closed except for the app origin (direct API access
  // during development/tools).
  app.enableCors({ origin: env.APP_ORIGIN, credentials: true });
  app.enableShutdownHooks();

  // Railway assigns and healthchecks against its own $PORT, which can
  // differ from API_PORT's default -- prefer it when present so the
  // platform's healthcheck prober actually reaches the listening socket.
  // Explicit "0.0.0.0" host: the default (no host arg) can bind IPv6-only
  // in some container network namespaces, unreachable to an IPv4 prober.
  const port = process.env.PORT ? Number(process.env.PORT) : env.API_PORT;
  await app.listen(port, "0.0.0.0");
  new Logger("Bootstrap").log(`NovaMail API listening on :${port}${API_PREFIX}`);
}

void bootstrap();
