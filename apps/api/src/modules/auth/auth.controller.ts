import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type {
  ChangePasswordDto,
  LoginDto,
  Provider,
  RegisterDto,
  SessionUserDto,
} from "@novamail/shared";
import {
  SESSION_COOKIE,
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "@novamail/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./guards/session.guard";
import { OAuthService } from "./oauth/oauth.service";
import { SessionService } from "./session.service";

function parseProvider(value: string): Provider {
  const upper = value.toUpperCase();
  if (upper !== "GOOGLE" && upper !== "MICROSOFT") {
    throw new UnauthorizedException(`Unknown provider: ${value}`);
  }
  return upper;
}

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  // NOTE: static routes are declared before ":provider" — Nest matches in
  // declaration order, and /auth/session must not be captured as a provider.
  /** GET /auth/session — app bootstrap: current user or 401. */
  @Get("session")
  @UseGuards(SessionGuard)
  async session(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionUserDto> {
    const dto = await this.auth.sessionUser(user.id);
    if (dto === null) {
      throw new UnauthorizedException("User no longer exists");
    }
    return dto;
  }

  /** POST /auth/register — create (or claim) a NovaMail account. */
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.auth.register(dto);
    await this.sessions.create(userId, req.header("user-agent"), res);
    const sessionUser = await this.auth.sessionUser(userId);
    if (sessionUser === null) {
      throw new UnauthorizedException("User no longer exists");
    }
    res.status(201).json(sessionUser);
  }

  /** POST /auth/login — username/password sign-in. */
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.auth.login(dto);
    await this.sessions.create(userId, req.header("user-agent"), res);
    const sessionUser = await this.auth.sessionUser(userId);
    if (sessionUser === null) {
      throw new UnauthorizedException("User no longer exists");
    }
    res.status(200).json(sessionUser);
  }

  /** PUT /auth/password — set a new password. Also the final step of
   * account recovery: identity there was already proven via OAuth. */
  @Put("password")
  @UseGuards(SessionGuard)
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.auth.setPassword(user.id, dto.password);
    res.status(204).send();
  }

  /** POST /auth/logout — destroy the current session. */
  @Post("logout")
  @UseGuards(SessionGuard)
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string | undefined>)[
      SESSION_COOKIE
    ];
    if (token !== undefined) {
      await this.sessions.destroy(token, res);
    }
    res.status(204).send();
  }

  /**
   * GET /auth/:provider — begin connecting a mailbox (default) or account
   * recovery (?intent=recover). Connecting always requires an existing
   * NovaMail session; recovery is the one OAuth entry point usable while
   * signed out, since there's no separate password-reset-by-email flow.
   */
  @Get(":provider")
  async begin(
    @Param("provider") providerParam: string,
    @Query("intent") intent: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const provider = parseProvider(providerParam);

    if (intent === "recover") {
      const url = await this.oauth.beginAuthorization(provider);
      res.redirect(url);
      return;
    }

    const token = (req.cookies as Record<string, string | undefined>)[
      SESSION_COOKIE
    ];
    const record = token !== undefined ? await this.sessions.resolve(token) : null;
    if (record === null) {
      throw new UnauthorizedException("Sign in before connecting an account");
    }

    const url = await this.oauth.beginAuthorization(provider, record.userId);
    res.redirect(url);
  }

  /** GET /auth/:provider/callback — provider redirect target. */
  @Get(":provider/callback")
  async callback(
    @Param("provider") providerParam: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") providerError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";
    const fail = async (reason: string): Promise<void> => {
      this.logger.warn(`OAuth callback failed: ${reason}`);
      // Recovery runs signed-out, so a failure there belongs on /login, not
      // the (auth-gated) connect-mailbox settings page.
      const recovering = state !== undefined && (await this.oauth.isRecoveryState(state));
      const dest = recovering ? `${appOrigin}/login` : `${appOrigin}/settings/accounts`;
      res.redirect(`${dest}?error=${encodeURIComponent(reason)}`);
    };

    if (providerError !== undefined) {
      return fail(providerError === "access_denied" ? "cancelled" : "provider");
    }
    if (code === undefined || state === undefined) {
      return fail("missing_params");
    }

    try {
      const provider = parseProvider(providerParam);
      const { identity, linkToUserId } =
        await this.oauth.completeAuthorization(provider, code, state);

      if (linkToUserId !== undefined) {
        await this.auth.handleIdentity(identity, linkToUserId);
        res.redirect(`${appOrigin}/settings/accounts`);
        return;
      }

      // Recovery: no session started this flow, so successfully completing
      // the provider handshake is itself the proof of identity. Sign in as
      // whichever NovaMail user already has this exact account connected.
      const recoveredUserId = await this.auth.findUserIdByProviderAccount(
        identity.provider,
        identity.providerAccountId,
      );
      if (recoveredUserId === null) {
        res.redirect(`${appOrigin}/login?error=no_account_found`);
        return;
      }
      await this.sessions.create(recoveredUserId, req.header("user-agent"), res);
      res.redirect(`${appOrigin}/settings/accounts?recovered=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      return fail(message);
    }
  }
}
