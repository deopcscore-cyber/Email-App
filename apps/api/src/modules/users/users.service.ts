import { Injectable } from "@nestjs/common";
import type { UpdateSettingsDto, UserSettingsDto } from "@novamail/shared";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    };
  }
}
