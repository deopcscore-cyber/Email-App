import { test as base, expect } from "@playwright/test";

/** Matches prisma/seed.mjs's DEV_SESSION_TOKEN — the seed script must have run. */
const DEV_SESSION_TOKEN = "dev-session-token-novamail";

/** A page pre-authenticated as the seeded dev user, starting on /inbox. */
export const test = base.extend<{ signedInPage: import("@playwright/test").Page }>({
  signedInPage: async ({ page, context }, use) => {
    await context.addCookies([
      {
        name: "novamail_session",
        value: DEV_SESSION_TOKEN,
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/inbox");
    await expect(page.getByRole("navigation", { name: "Mailboxes" })).toBeVisible();
    // `page.keyboard.press()` dispatches raw key events with no actionability
    // wait, so it can beat React hydration on a freshly loaded page (the SSR
    // markup paints before the KeyboardProvider's effect attaches its
    // listener). Waiting for the client-fetched thread list is a strong
    // hydration signal: it can't render without client JS having run.
    await expect(
      page.getByRole("listbox", { name: /conversations/ }).getByRole("option").first(),
    ).toBeVisible();
    await use(page);
  },
});

export { expect };
