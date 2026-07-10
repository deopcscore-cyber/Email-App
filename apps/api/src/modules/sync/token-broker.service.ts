import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Provider } from "@novamail/shared";
import { ENV, type Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { TokenVaultService } from "../auth/token-vault.service";

/** Marks an account whose refresh token no longer works. */
export class TokenRevokedError extends Error {
  constructor(readonly accountId: string) {
    super(`Refresh token revoked for account ${accountId}`);
  }
}

/**
 * Exchanges stored refresh tokens for short-lived access tokens, cached in
 * Redis until near expiry. All provider calls obtain tokens here.
 */
@Injectable()
export class TokenBrokerService {
  private readonly logger = new Logger(TokenBrokerService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly vault: TokenVaultService,
  ) {}

  async accessTokenFor(accountId: string): Promise<string> {
    const cached = await this.redis.client.get(`oauth:access:${accountId}`);
    if (cached !== null) return cached;

    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { provider: true, encryptedRefreshToken: true },
    });
    const refreshToken = this.vault.decrypt(account.encryptedRefreshToken);
    const { accessToken, expiresIn } = await this.refresh(
      account.provider,
      refreshToken,
      accountId,
    );

    await this.redis.client.set(
      `oauth:access:${accountId}`,
      accessToken,
      "EX",
      Math.max(expiresIn - 60, 60),
    );
    return accessToken;
  }

  private async refresh(
    provider: Provider,
    refreshToken: string,
    accountId: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const config =
      provider === "GOOGLE"
        ? {
            url: "https://oauth2.googleapis.com/token",
            clientId: this.env.GOOGLE_CLIENT_ID,
            clientSecret: this.env.GOOGLE_CLIENT_SECRET,
          }
        : {
            url: `https://login.microsoftonline.com/${this.env.MICROSOFT_TENANT}/oauth2/v2.0/token`,
            clientId: this.env.MICROSOFT_CLIENT_ID,
            clientSecret: this.env.MICROSOFT_CLIENT_SECRET,
          };

    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // invalid_grant = user revoked access; flag the account for reconnect.
      if (res.status === 400 && body.includes("invalid_grant")) {
        await this.prisma.emailAccount.update({
          where: { id: accountId },
          data: { syncStatus: "DISCONNECTED" },
        });
        throw new TokenRevokedError(accountId);
      }
      throw new Error(`Token refresh failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    return { accessToken: json.access_token, expiresIn: json.expires_in };
  }
}
