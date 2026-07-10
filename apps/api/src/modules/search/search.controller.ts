import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { SearchResultDto } from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import { SearchService } from "./search.service";

@Controller("search")
@UseGuards(SessionGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Query("q") q: string | undefined,
  ): Promise<SearchResultDto> {
    return this.search.search(user.id, q ?? "");
  }
}
