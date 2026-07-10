import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LabelsController } from "./labels.controller";

@Module({
  imports: [AuthModule],
  controllers: [LabelsController],
})
export class LabelsModule {}
