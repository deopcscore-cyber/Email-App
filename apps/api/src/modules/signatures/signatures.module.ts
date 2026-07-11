import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SignaturesController } from "./signatures.controller";

@Module({
  imports: [AuthModule],
  controllers: [SignaturesController],
})
export class SignaturesModule {}
