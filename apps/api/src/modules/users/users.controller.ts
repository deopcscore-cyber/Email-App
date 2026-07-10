import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from "@nestjs/common";
import {
  updateSettingsSchema,
  type SessionUserDto,
  type UpdateSettingsDto,
  type UserSettingsDto,
} from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuthService } from "../auth/auth.service";
import { SessionGuard } from "../auth/guards/session.guard";
import { UsersService } from "./users.service";

@Controller("me")
@UseGuards(SessionGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthenticatedUser): Promise<SessionUserDto> {
    const dto = await this.auth.sessionUser(user.id);
    if (dto === null) {
      throw new NotFoundException("User not found");
    }
    return dto;
  }

  @Patch("settings")
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsDto,
  ): Promise<UserSettingsDto> {
    return this.users.updateSettings(user.id, body);
  }
}
