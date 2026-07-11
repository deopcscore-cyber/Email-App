import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { AiModule } from "./modules/ai/ai.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CsrfGuard } from "./modules/auth/guards/csrf.guard";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { EventsModule } from "./modules/events/events.module";
import { HealthModule } from "./modules/health/health.module";
import { LabelsModule } from "./modules/labels/labels.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { SearchModule } from "./modules/search/search.module";
import { SignaturesModule } from "./modules/signatures/signatures.module";
import { SyncModule } from "./modules/sync/sync.module";
import { ThreadsModule } from "./modules/threads/threads.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    EventsModule,
    SyncModule,
    AuthModule,
    UsersModule,
    ThreadsModule,
    LabelsModule,
    MessagesModule,
    SearchModule,
    ContactsModule,
    AiModule,
    SignaturesModule,
  ],
  providers: [
    // CSRF applies globally to every mutating route; safe methods pass.
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
