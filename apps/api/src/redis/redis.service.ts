import {
  Inject,
  Injectable,
  OnModuleDestroy,
} from "@nestjs/common";
import Redis from "ioredis";
import { ENV, type Env } from "../config/env";

/**
 * Thin wrapper owning the Redis connection lifecycle. Feature code depends on
 * this service (not ioredis directly) so the connection is a single, managed
 * resource that tests can replace.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
