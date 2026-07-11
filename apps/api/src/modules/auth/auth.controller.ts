import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { LoginDto, Provider, RegisterDto, SessionUserDto } from "@novamail/shared";
import { SESSION_COOKIE, loginSchema, registerSchema } from "@novamail/shared";
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
   * GET /auth/:provider — begin connecting a mailbox. Google/Microsoft are
   * connect-only now: this always requires an existing NovaMail session.
   */
  @Get(":provider")
  async begin(
    @Param("provider") providerParam: string,
    @Query("intent") intent: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const provider = parseProvider(providerParam);

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
    const fail = (reason: string): void => {
      this.logger.warn(`OAuth callback failed: ${reason}`);
      res.redirect(`${appOrigin}/settings/accounts?error=${encodeURIComponent(reason)}`);
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
      await this.auth.handleIdentity(identity, linkToUserId);
      res.redirect(`${appOrigin}/settings/accounts`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      return fail(message);
    }
  }
}
