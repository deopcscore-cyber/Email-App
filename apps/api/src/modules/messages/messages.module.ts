import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AttachmentsController } from "./attachments.controller";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { SendProcessorService } from "./send-processor.service";

@Module({
  imports: [AuthModule],
  controllers: [MessagesController, AttachmentsController],
  providers: [MessagesService, SendProcessorService],
  exports: [MessagesService, SendProcessorService],
})
export class MessagesModule {}
