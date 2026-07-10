import { Controller, Get, UseGuards } from "@nestjs/common";
import type { LabelWithCountDto } from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionGuard } from "../auth/guards/session.guard";

@Controller("labels")
@UseGuards(SessionGuard)
export class LabelsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LabelWithCountDto[]> {
    const labels = await this.prisma.label.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { threads: true } } },
    });
    return labels.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      threadCount: l._count.threads,
    }));
  }
}
