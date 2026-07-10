import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from "@nestjs/common";
import Redis from "ioredis";
import type { MailEvent } from "@novamail/shared";
import { ENV, type Env } from "../../config/env";
import { RedisService } from "../../redis/redis.service";

type Listener = (event: MailEvent) => void;

/**
 * Realtime fan-out. Events are published to a per-user Redis channel so any
 * API instance can deliver them to its connected SSE clients — the API and
 * the worker publish through the same path.
 */
@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly subscriber: Redis;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(
    @Inject(ENV) env: Env,
    private readonly redis: RedisService,
  ) {
    this.subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.subscriber.on("pmessage", (_pattern, channel, raw) => {
      const userId = channel.slice("events:".length);
      const set = this.listeners.get(userId);
      if (set === undefined) return;
      try {
        const event = JSON.parse(raw) as MailEvent;
        for (const listener of set) listener(event);
      } catch (err) {
        this.logger.warn(`Bad event payload on ${channel}: ${String(err)}`);
      }
    });
    void this.subscriber.psubscribe("events:*");
  }

  async publish(userId: string, event: MailEvent): Promise<void> {
    await this.redis.client.publish(`events:${userId}`, JSON.stringify(event));
  }

  /** Register an SSE client; returns unsubscribe. */
  subscribe(userId: string, listener: Listener): () => void {
    let set = this.listeners.get(userId);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(userId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(userId);
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.quit();
  }
}
