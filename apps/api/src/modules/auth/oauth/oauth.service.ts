import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Provider } from "@novamail/shared";
import { API_PREFIX } from "@novamail/shared";
import { ENV, type Env } from "../../../config/env";
import { RedisService } from "../../../redis/redis.service";
import type {
  OAuthIdentity,
  OAuthProviderConfig,
  OAuthState,
} from "./oauth.types";

const STATE_TTL_SECONDS = 600;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
}

interface IdTokenClaims {
  sub: string;
  oid?: string; // Microsoft object id — stabler than sub across apps
  email?: string;
  preferred_username?: string;
  name?: string;
  picture?: string;
}

/**
 * Implements the OAuth 2.0 authorization-code flow with PKCE for Google and
 * Microsoft directly over their token endpoints — no passport, full control
 * over state, PKCE, and offline access.
 */
@Injectable()
export class OAuthService {
  private readonly providers: Record<Provider, OAuthProviderConfig>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly redis: RedisService,
  ) {
    this.providers = {
      GOOGLE: {
        provider: "GOOGLE",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/gmail.modify",
        ],
        // offline + consent guarantees a refresh token on every connect
        extraAuthParams: { access_type: "offline", prompt: "consent" },
      },
      MICROSOFT: {
        provider: "MICROSOFT",
        authorizationUrl: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/oauth2/v2.0/token`,
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        scopes: [
          "openid",
          "email",
          "profile",
          "offline_access",
          "User.Read",
          "Mail.ReadWrite",
          "Mail.Send",
        ],
        extraAuthParams: { prompt: "select_account" },
      },
    };
  }

  isConfigured(provider: Provider): boolean {
    const cfg = this.providers[provider];
    return cfg.clientId !== "" && cfg.clientSecret !== "";
  }

  private redirectUri(provider: Provider): string {
    return `${this.env.APP_ORIGIN}${API_PREFIX}/auth/${provider.toLowerCase()}/callback`;
  }

  /** Builds the provider redirect and persists state+verifier in Redis.
   * `linkToUserId` omitted means account recovery, not connecting a
   * mailbox to an already-signed-in user -- see OAuthState. */
  async beginAuthorization(
    provider: Provider,
    linkToUserId?: string,
  ): Promise<string> {
    if (!this.isConfigured(provider)) {
      throw new BadRequestException(
        `${provider} OAuth is not configured on this server`,
      );
    }
    const cfg = this.providers[provider];

    const state = randomBytes(24).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const record: OAuthState = { provider, codeVerifier, linkToUserId };
    await this.redis.client.set(
      `oauth:state:${state}`,
      JSON.stringify(record),
      "EX",
      STATE_TTL_SECONDS,
    );

    const url = new URL(cfg.authorizationUrl);
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri(provider));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", cfg.scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    for (const [k, v] of Object.entries(cfg.extraAuthParams)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  }

  /** Peeks (without consuming) whether a still-pending state belongs to a
   * recovery attempt, so a failed/cancelled callback can redirect to
   * /login instead of the connect-mailbox settings page before we know
   * whether the caller is signed in at all. */
  async isRecoveryState(state: string): Promise<boolean> {
    const raw = await this.redis.client.get(`oauth:state:${state}`);
    if (raw === null) return false;
    const stored = JSON.parse(raw) as OAuthState;
    return stored.linkToUserId === undefined;
  }

  /** Validates state, exchanges the code, and normalizes the identity. */
  async completeAuthorization(
    provider: Provider,
    code: string,
    state: string,
  ): Promise<{ identity: OAuthIdentity; linkToUserId?: string }> {
    const key = `oauth:state:${state}`;
    const raw = await this.redis.client.getdel(key); // single-use state
    if (raw === null) {
      throw new UnauthorizedException("OAuth state is invalid or expired");
    }
    const stored = JSON.parse(raw) as OAuthState;
    if (stored.provider !== provider) {
      throw new UnauthorizedException("OAuth state/provider mismatch");
    }

    const cfg = this.providers[provider];
    const tokens = await this.exchangeCode(cfg, code, stored.codeVerifier, provider);

    if (tokens.refresh_token === undefined) {
      throw new UnauthorizedException(
        "Provider did not return a refresh token; cannot sync this mailbox",
      );
    }

    // The id_token arrives directly from the issuer over TLS in the code
    // exchange, so decoding its payload without signature verification is safe
    // in this flow (we never accept id_tokens from the client).
    const claims = this.decodeIdToken(tokens.id_token);
    const email = claims.email ?? claims.preferred_username;
    if (email === undefined) {
      throw new UnauthorizedException("Provider identity has no email address");
    }

    const identity: OAuthIdentity = {
      provider,
      providerAccountId: claims.oid ?? claims.sub,
      email: email.toLowerCase(),
      name: claims.name ?? email,
      avatarUrl: claims.picture ?? null,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresIn: tokens.expires_in,
      scopes: tokens.scope?.split(" ") ?? cfg.scopes,
    };
    return { identity, linkToUserId: stored.linkToUserId };
  }

  private async exchangeCode(
    cfg: OAuthProviderConfig,
    code: string,
    codeVerifier: string,
    provider: Provider,
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: this.redirectUri(provider),
      code_verifier: codeVerifier,
    });

    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new UnauthorizedException(
        `Token exchange with ${provider} failed: ${text.slice(0, 300)}`,
      );
    }
    return (await res.json()) as TokenResponse;
  }

  private decodeIdToken(idToken: string | undefined): IdTokenClaims {
    if (idToken === undefined) {
      throw new UnauthorizedException("Provider did not return an id_token");
    }
    const payload = idToken.split(".")[1];
    if (payload === undefined) {
      throw new UnauthorizedException("Malformed id_token");
    }
    return JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as IdTokenClaims;
  }
}
