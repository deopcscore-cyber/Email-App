import { Global, Module } from "@nestjs/common";
import { ENV, loadEnv } from "./env";

/** Validated environment, injectable everywhere via the ENV token. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: loadEnv }],
  exports: [ENV],
})
export class ConfigModule {}
