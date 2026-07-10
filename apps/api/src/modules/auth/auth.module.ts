import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./guards/session.guard";
import { OAuthService } from "./oauth/oauth.service";
import { SessionService } from "./session.service";
import { TokenVaultService } from "./token-vault.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    OAuthService,
    SessionService,
    TokenVaultService,
    SessionGuard,
  ],
  exports: [AuthService, SessionService, SessionGuard, TokenVaultService],
})
export class AuthModule {}
