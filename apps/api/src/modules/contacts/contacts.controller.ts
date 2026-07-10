import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { ContactDto } from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionGuard } from "../auth/guards/session.guard";

@Controller("contacts")
@UseGuards(SessionGuard)
export class ContactsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Recipient autocomplete, ranked by interaction frequency. */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q: string | undefined,
  ): Promise<ContactDto[]> {
    const contacts = await this.prisma.contact.findMany({
      where: {
        account: { userId: user.id },
        ...(q !== undefined && q !== ""
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ interactions: "desc" }, { lastInteracted: "desc" }],
      take: 8,
      select: { id: true, email: true, name: true },
    });
    return contacts;
  }
}
