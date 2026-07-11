import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CannedResponsesController } from "./canned-responses.controller";

@Module({
  imports: [AuthModule],
  controllers: [CannedResponsesController],
})
export class CannedResponsesModule {}
