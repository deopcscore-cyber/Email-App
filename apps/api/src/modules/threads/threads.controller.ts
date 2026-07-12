import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  categorySchema,
  mailViewSchema,
  triagePatchSchema,
  type ThreadCountsDto,
  type ThreadDetailDto,
  type ThreadListItemDto,
  type ThreadPageDto,
  type TriagePatchDto,
} from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SessionGuard } from "../auth/guards/session.guard";
import { ThreadsService } from "./threads.service";

@Controller("threads")
@UseGuards(SessionGuard)
export class ThreadsController {
  constructor(private readonly threads: ThreadsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("view") viewRaw: string | undefined,
    @Query("category") categoryRaw: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("accountId") accountId: string | undefined,
    @Query("labelId") labelId: string | undefined,
  ): Promise<ThreadPageDto> {
    const view = mailViewSchema.safeParse(viewRaw ?? "inbox");
    if (!view.success) {
      throw new BadRequestException(`Unknown view: ${viewRaw}`);
    }
    const category =
      categoryRaw !== undefined ? categorySchema.safeParse(categoryRaw) : undefined;
    if (category !== undefined && !category.success) {
      throw new BadRequestException(`Unknown category: ${categoryRaw}`);
    }
    return this.threads.list(user.id, view.data, {
      category: category?.data,
      cursor,
      accountId: accountId === "unified" ? undefined : accountId,
      labelId,
    });
  }

  // Declared before :id so it isn't captured as a thread id.
  @Get("counts")
  async counts(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ThreadCountsDto> {
    return this.threads.counts(user.id);
  }

  @Get(":id")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ThreadDetailDto> {
    return this.threads.get(user.id, id);
  }

  @Patch(":id")
  async patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(triagePatchSchema)) patch: TriagePatchDto,
  ): Promise<ThreadListItemDto> {
    return this.threads.patch(user.id, id, patch);
  }
}
