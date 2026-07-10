import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SnoozeProcessorService } from "./snooze-processor.service";
import { ThreadsController } from "./threads.controller";
import { ThreadsService } from "./threads.service";

@Module({
  imports: [AuthModule],
  controllers: [ThreadsController],
  providers: [ThreadsService, SnoozeProcessorService],
  exports: [ThreadsService, SnoozeProcessorService],
})
export class ThreadsModule {}
