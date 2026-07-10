import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import {
  nlSearchRequestSchema,
  type NlSearchRequestDto,
  type NlSearchResultDto,
  type SearchResultDto,
} from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AiRateLimitGuard } from "../ai/ai-rate-limit.guard";
import { SessionGuard } from "../auth/guards/session.guard";
import { NlCompilerService } from "./nl-compiler.service";
import { SearchService } from "./search.service";

@Controller("search")
@UseGuards(SessionGuard)
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly nl: NlCompilerService,
  ) {}

  @Get()
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q: string | undefined,
  ): Promise<SearchResultDto> {
    return this.search.search(user.id, q ?? "");
  }

  @Post("nl")
  @UseGuards(AiRateLimitGuard)
  nlSearch(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(nlSearchRequestSchema)) body: NlSearchRequestDto,
  ): Promise<NlSearchResultDto> {
    return this.nl.run(user.id, body.query);
  }
}
