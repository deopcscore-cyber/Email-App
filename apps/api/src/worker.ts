import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";
import { QueueService } from "./jobs/queue.service";
import type { SendJobData, SnoozeJobData, SyncJobData } from "./jobs/queues";
import { SendProcessorService } from "./modules/messages/send-processor.service";
import { SyncService } from "./modules/sync/sync.service";
import { SnoozeProcessorService } from "./modules/threads/snooze-processor.service";

const POLL_INTERVAL_MS = 2 * 60_000;

/**
 * BullMQ consumer process. Shares the API's DI container (same modules, no
 * HTTP listener) so processors use the exact services the API does.
 * Run: node dist/worker.js
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = new Logger("Worker");
  const app = await NestFactory.createApplicationContext(AppModule);

  const sync = app.get(SyncService);
  const send = app.get(SendProcessorService);
  const snooze = app.get(SnoozeProcessorService);
  const queues = app.get(QueueService);

  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const opts = { connection, concurrency: 5 };

  // No push-notification infra is wired up (see SyncService.pollAll), so this
  // is what keeps mail flowing in after the initial backfill. Idempotent --
  // safe to call on every worker boot even across deploys/restarts.
  await queues
    .queue("sync")
    .upsertJobScheduler("poll-all", { every: POLL_INTERVAL_MS }, { data: { kind: "poll-all" } });

  const workers = [
    new Worker<SyncJobData>(
      "sync",
      async (job: Job<SyncJobData>) => {
        const { kind, accountId } = job.data;
        if (kind === "poll-all") await sync.pollAll();
        else if (accountId === undefined) return;
        else if (kind === "backfill") await sync.backfill(accountId);
        else if (kind === "delta") await sync.delta(accountId);
        else if (kind === "writeback" && job.data.threadId !== undefined) {
          await sync.writeback(accountId, job.data.threadId, job.data.action ?? {});
        }
      },
      opts,
    ),
    new Worker<SendJobData>(
      "send",
      (job: Job<SendJobData>) => send.dispatch(job.data.messageId, job.data.userId),
      opts,
    ),
    new Worker<SnoozeJobData>(
      "snooze",
      (job: Job<SnoozeJobData>) => snooze.wake(job.data.threadId, job.data.userId),
      opts,
    ),
  ];

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      logger.error(`${worker.name} job ${job?.id ?? "?"} failed: ${err.message}`);
    });
  }
  logger.log(`Worker consuming queues: ${workers.map((w) => w.name).join(", ")}`);

  const shutdown = async (): Promise<void> => {
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void bootstrap();
