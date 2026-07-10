import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AiRateLimitGuard } from "../ai/ai-rate-limit.guard";
import { AuthModule } from "../auth/auth.module";
import { ThreadsModule } from "../threads/threads.module";
import { NlCompilerService } from "./nl-compiler.service";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  imports: [AuthModule, ThreadsModule, AiModule],
  controllers: [SearchController],
  providers: [SearchService, NlCompilerService, AiRateLimitGuard],
})
export class SearchModule {}
