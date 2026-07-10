import type { Provider } from "@novamail/shared";

/** Static endpoint/scope description of an OAuth provider. */
export interface OAuthProviderConfig {
  provider: Provider;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  /** Provider-specific extra params for the authorization redirect. */
  extraAuthParams: Record<string, string>;
}

/** What we keep in Redis between redirect and callback (10 min TTL). */
export interface OAuthState {
  provider: Provider;
  codeVerifier: string;
  /** Set when an already-authenticated user is linking another mailbox. */
  linkToUserId?: string;
}

/** Normalized result of a completed code exchange. */
export interface OAuthIdentity {
  provider: Provider;
  providerAccountId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresIn: number;
  scopes: string[];
}
