import {
  Inject,
  Injectable,
  OnModuleDestroy,
} from "@nestjs/common";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { ENV, type Env } from "../config/env";
import {
  QUEUE_NAMES,
  type JobDataFor,
  type QueueName,
  type SendJobData,
  type SnoozeJobData,
  type SyncJobData,
} from "./queues";

/**
 * Producer side of BullMQ: one shared connection, lazily created queues.
 * Consumers live in worker.ts (separate process in production).
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(ENV) env: Env) {
    // BullMQ requires maxRetriesPerRequest: null on its connections.
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  queue<Q extends QueueName>(name: Q): Queue<JobDataFor<Q>, unknown, string> {
    let q = this.queues.get(name);
    if (q === undefined) {
      q = new Queue(name, {
        connection: this.connection,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: 500,
          removeOnFail: 2_000,
        },
      });
      this.queues.set(name, q);
    }
    return q as Queue<JobDataFor<Q>, unknown, string>;
  }

  async enqueue<Q extends QueueName>(
    name: Q,
    data: JobDataFor<Q>,
    options: { delayMs?: number; jobId?: string } = {},
  ): Promise<void> {
    // Concrete union type so bullmq's conditional name type resolves.
    const queue = this.queue(name) as unknown as Queue<
      SyncJobData | SendJobData | SnoozeJobData,
      unknown,
      string
    >;
    await queue.add(name, data, {
      ...(options.delayMs !== undefined && { delay: options.delayMs }),
      ...(options.jobId !== undefined && { jobId: options.jobId }),
    });
  }

  /** Cancel a delayed job (undo-send, re-snooze). True if removed. */
  async cancel(name: QueueName, jobId: string): Promise<boolean> {
    const job = await this.queue(name).getJob(jobId);
    if (job === undefined) return false;
    const state = await job.getState();
    if (state === "delayed" || state === "waiting") {
      await job.remove();
      return true;
    }
    return false;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    await this.connection.quit();
  }
}

export { QUEUE_NAMES };
