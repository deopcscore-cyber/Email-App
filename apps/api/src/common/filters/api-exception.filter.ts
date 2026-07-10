import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import type { ApiError } from "@novamail/shared";

const CODE_BY_STATUS: Record<number, string> = {
  400: "VALIDATION",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
};

/** Normalizes every error into the `{ error: { code, message } }` envelope. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (typeof body === "object" && body !== null) {
        const b = body as { message?: string | string[]; details?: unknown };
        message = Array.isArray(b.message)
          ? b.message.join("; ")
          : (b.message ?? exception.message);
        details = b.details;
      }
    } else {
      this.logger.error(exception);
    }

    const payload: ApiError = {
      error: {
        code: CODE_BY_STATUS[status] ?? "INTERNAL",
        message,
        ...(details !== undefined ? { details } : {}),
      },
    };
    res.status(status).json(payload);
  }
}
