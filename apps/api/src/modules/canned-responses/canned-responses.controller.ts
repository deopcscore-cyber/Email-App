import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type {
  CannedResponseDto,
  CreateCannedResponseDto,
  UpdateCannedResponseDto,
} from "@novamail/shared";
import {
  createCannedResponseSchema,
  updateCannedResponseSchema,
} from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionGuard } from "../auth/guards/session.guard";

@Controller("canned-responses")
@UseGuards(SessionGuard)
export class CannedResponsesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CannedResponseDto[]> {
    const rows = await this.prisma.cannedResponse.findMany({
      where: { userId: user.id },
      orderBy: { title: "asc" },
    });
    return rows.map(this.toDto);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCannedResponseSchema))
    body: CreateCannedResponseDto,
  ): Promise<CannedResponseDto> {
    const row = await this.prisma.cannedResponse.create({
      data: { userId: user.id, ...body },
    });
    return this.toDto(row);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCannedResponseSchema))
    body: UpdateCannedResponseDto,
  ): Promise<CannedResponseDto> {
    await this.owned(user.id, id);
    const row = await this.prisma.cannedResponse.update({
      where: { id },
      data: body,
    });
    return this.toDto(row);
  }

  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    await this.owned(user.id, id);
    await this.prisma.cannedResponse.delete({ where: { id } });
    return { ok: true };
  }

  private async owned(userId: string, id: string): Promise<void> {
    const row = await this.prisma.cannedResponse.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (row === null) {
      throw new NotFoundException("Canned response not found");
    }
  }

  private toDto = (row: {
    id: string;
    title: string;
    bodyHtml: string;
    updatedAt: Date;
  }): CannedResponseDto => ({
    id: row.id,
    title: row.title,
    bodyHtml: row.bodyHtml,
    updatedAt: row.updatedAt.toISOString(),
  });
}
