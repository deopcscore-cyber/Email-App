import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AiController } from "./ai.controller";
import { AiRateLimitGuard } from "./ai-rate-limit.guard";
import { AiService } from "./ai.service";
import { OpenAiClient } from "./openai.client";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, OpenAiClient, AiRateLimitGuard],
  exports: [AiService, OpenAiClient],
})
export class AiModule {}
