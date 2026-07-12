import { Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateSettingsDto, UserSettingsDto } from "@novamail/shared";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Disconnects a mailbox -- cascades to its threads/messages/contacts.
   * The provider-side mailbox is untouched; this only removes it from
   * NovaMail, which is fine even for a user's last connected account since
   * accounts and mailbox connections are independent (username/password
   * sign-in doesn't require a connected mailbox). */
  async removeAccount(userId: string, accountId: string): Promise<void> {
    const { count } = await this.prisma.emailAccount.deleteMany({
      where: { id: accountId, userId },
    });
    if (count === 0) {
      throw new NotFoundException("Account not found");
    }
  }

  async updateSettings(
    userId: string,
    patch: UpdateSettingsDto,
  ): Promise<UserSettingsDto> {
    const settings = await this.prisma.userSettings.update({
      where: { userId },
      data: patch,
    });
    return {
      theme: settings.theme,
      undoWindowSeconds: settings.undoWindowSeconds as 0 | 5 | 10 | 30,
      aiEnabled: settings.aiEnabled,
      aiAutoLabels: settings.aiAutoLabels,
      aiDailyBriefing: settings.aiDailyBriefing,
      aiFollowUps: settings.aiFollowUps,
      briefingHourLocal: settings.briefingHourLocal,
      timezone: settings.timezone,
      notificationSound: settings.notificationSound,
    };
  }
}
