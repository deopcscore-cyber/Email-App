import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";

interface HealthResponse {
  status: "ok";
  postgres: "ok";
  redis: "ok";
}

/**
 * Unauthenticated liveness/readiness probe for Railway (and any load
 * balancer). Verifies the two hard dependencies the API can't function
 * without; a healthy 200 here is what gates traffic to a new deploy.
 */
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      throw new HttpException(
        `Postgres unreachable: ${err instanceof Error ? err.message : "unknown"}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      await this.redis.client.ping();
    } catch (err) {
      throw new HttpException(
        `Redis unreachable: ${err instanceof Error ? err.message : "unknown"}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { status: "ok", postgres: "ok", redis: "ok" };
  }
}
