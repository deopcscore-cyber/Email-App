import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionGuard } from "../auth/guards/session.guard";
import { SyncService, isSeedAccount } from "../sync/sync.service";
import { TokenBrokerService } from "../sync/token-broker.service";
import { UPLOAD_DIR } from "./messages.service";

@Controller("attachments")
@UseGuards(SessionGuard)
export class AttachmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    private readonly broker: TokenBrokerService,
  ) {}

  /** Streams attachment bytes: local uploads directly, synced mail via provider. */
  @Get(":id/download")
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query("disposition") disposition: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, message: { account: { userId: user.id } } },
      include: { message: { include: { account: true } } },
    });
    if (attachment === null) {
      throw new NotFoundException("Attachment not found");
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `${disposition === "inline" ? "inline" : "attachment"}; filename="${encodeURIComponent(attachment.filename)}"`,
    );

    if (attachment.storageKey !== null) {
      createReadStream(join(UPLOAD_DIR, attachment.storageKey)).pipe(res);
      return;
    }

    const account = attachment.message.account;
    if (
      isSeedAccount(account) ||
      attachment.providerAttachmentId === null ||
      attachment.message.providerMessageId === null
    ) {
      throw new NotFoundException("Attachment content unavailable (dev seed)");
    }
    const provider = this.sync.providerFor(account);
    const accessToken = await this.broker.accessTokenFor(account.id);
    const bytes = await provider.fetchAttachment(
      accessToken,
      attachment.message.providerMessageId,
      attachment.providerAttachmentId,
    );
    res.end(bytes);
  }
}
