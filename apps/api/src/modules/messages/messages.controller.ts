import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  createDraftSchema,
  sendMessageSchema,
  updateDraftSchema,
  type CreateDraftDto,
  type DraftDto,
  type SendMessageDto,
  type SendResultDto,
  type UpdateDraftDto,
} from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SessionGuard } from "../auth/guards/session.guard";
import { MessagesService } from "./messages.service";

@Controller("messages")
@UseGuards(SessionGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post("drafts")
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDraftSchema)) dto: CreateDraftDto,
  ): Promise<DraftDto> {
    return this.messages.createDraft(user.id, dto);
  }

  @Get("drafts/:id")
  getDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<DraftDto> {
    return this.messages.getDraft(user.id, id);
  }

  @Patch("drafts/:id")
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDraftSchema)) dto: UpdateDraftDto,
  ): Promise<DraftDto> {
    return this.messages.updateDraft(user.id, id, dto);
  }

  @Delete("drafts/:id")
  @HttpCode(204)
  async deleteDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<void> {
    await this.messages.deleteDraft(user.id, id);
  }

  @Post(":id/send")
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
  ): Promise<SendResultDto> {
    return this.messages.send(user.id, id, dto.scheduledAt);
  }

  @Post(":id/undo")
  undo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<DraftDto> {
    return this.messages.undo(user.id, id);
  }

  @Post(":id/attachments")
  @UseInterceptors(FileInterceptor("file"))
  addAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DraftDto["attachments"][number]> {
    return this.messages.addAttachment(user.id, id, file);
  }

  @Delete(":id/attachments/:attachmentId")
  @HttpCode(204)
  async removeAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
  ): Promise<void> {
    await this.messages.removeAttachment(user.id, id, attachmentId);
  }
}
