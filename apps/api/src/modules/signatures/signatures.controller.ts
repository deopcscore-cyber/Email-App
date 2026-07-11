import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import type { SignatureDto, UpdateSignatureDto } from "@novamail/shared";
import { updateSignatureSchema } from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionGuard } from "../auth/guards/session.guard";

@Controller("signatures")
@UseGuards(SessionGuard)
export class SignaturesController {
  constructor(private readonly prisma: PrismaService) {}

  /** One entry per connected account; accounts without a saved signature
   * get a synthesized empty/disabled default so the client never has to
   * special-case "missing". */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SignatureDto[]> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { userId: user.id },
      select: { id: true, signature: true },
      orderBy: { createdAt: "asc" },
    });
    return accounts.map((a) => ({
      accountId: a.id,
      bodyHtml: a.signature?.bodyHtml ?? "",
      isEnabled: a.signature?.isEnabled ?? false,
    }));
  }

  @Put(":accountId")
  async upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string,
    @Body(new ZodValidationPipe(updateSignatureSchema)) body: UpdateSignatureDto,
  ): Promise<SignatureDto> {
    const account = await this.prisma.emailAccount.findFirst({
      where: { id: accountId, userId: user.id },
      select: { id: true },
    });
    if (account === null) {
      throw new NotFoundException("Account not found");
    }
    const signature = await this.prisma.signature.upsert({
      where: { accountId },
      create: { accountId, ...body },
      update: body,
    });
    return {
      accountId: signature.accountId,
      bodyHtml: signature.bodyHtml,
      isEnabled: signature.isEnabled,
    };
  }
}
