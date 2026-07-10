import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CsrfGuard } from "./modules/auth/guards/csrf.guard";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, AuthModule, UsersModule],
  providers: [
    // CSRF applies globally to every mutating route; safe methods pass.
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
