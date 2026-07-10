import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { SESSION_COOKIE } from "@novamail/shared";
import type { AuthenticatedRequest } from "../../../common/decorators/current-user.decorator";
import { SessionService } from "../session.service";

/** Rejects requests without a valid session cookie; attaches `req.user`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (req.cookies as Record<string, string | undefined>)[
      SESSION_COOKIE
    ];
    if (token === undefined) {
      throw new UnauthorizedException("Not signed in");
    }
    const record = await this.sessions.resolve(token);
    if (record === null) {
      throw new UnauthorizedException("Session expired");
    }
    req.user = { id: record.userId, sessionId: record.sessionId };
    return true;
  }
}
