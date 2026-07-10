import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QueueService } from "../../jobs/queue.service";
import { GmailProvider } from "./providers/gmail.provider";
import { GraphProvider } from "./providers/graph.provider";
import { SyncService } from "./sync.service";
import { TokenBrokerService } from "./token-broker.service";
import { WebhooksController } from "./webhooks.controller";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [WebhooksController],
  providers: [
    QueueService,
    SyncService,
    TokenBrokerService,
    GmailProvider,
    GraphProvider,
  ],
  exports: [QueueService, SyncService, TokenBrokerService],
})
export class SyncModule {}
