import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** The authenticated principal attached to the request by SessionGuard. */
export interface AuthenticatedUser {
  id: string;
  sessionId: string;
}

/** Requests that passed SessionGuard carry the authenticated user. */
export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.user;
  },
);
