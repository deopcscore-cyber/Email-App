import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../../common/decorators/current-user.decorator";
import { RedisService } from "../../redis/redis.service";

const LIMIT = 30;
const WINDOW_SECONDS = 300;

/** 30 AI calls per 5 minutes per user — cost protection. */
@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = `rate:${req.user.id}:ai`;
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, WINDOW_SECONDS);
    }
    if (count > LIMIT) {
      const ttl = await this.redis.client.ttl(key);
      throw new HttpException(
        {
          message: "AI rate limit reached — try again shortly",
          details: { retryAfter: ttl },
        },
        429,
      );
    }
    return true;
  }
}
