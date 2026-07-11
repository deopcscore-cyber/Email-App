import { expect, test } from "./fixtures";

test.describe("Command palette search", () => {
  test("instant keyword search finds a matching seeded email", async ({
    signedInPage: page,
  }) => {
    await page.keyboard.press("Meta+k");
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    await expect(dialog).toBeVisible();

    await page.keyboard.type("campaign");
    await expect(
      dialog.getByRole("listbox", { name: "Matching emails" }).getByRole("option"),
    ).toHaveCount(1, { timeout: 5_000 });
  });

  test("an operator query narrows results (has:attachment)", async ({
    signedInPage: page,
  }) => {
    await page.keyboard.press("Meta+k");
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    await page.keyboard.type("has:attachment");

    const results = dialog.getByRole("listbox", { name: "Matching emails" }).getByRole("option");
    await expect(results.first()).toBeVisible({ timeout: 5_000 });
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
  });

  test("selecting a command from the palette navigates the app", async ({
    signedInPage: page,
  }) => {
    await page.keyboard.press("Meta+k");
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    await dialog.getByRole("option", { name: "Go to Drafts" }).click();
    await expect(page).toHaveURL(/\/drafts$/);
  });

  test("Escape closes the palette without navigating", async ({ signedInPage: page }) => {
    await page.keyboard.press("Meta+k");
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    // Wait for the dialog (and its overlay-scoped Escape handler) to mount
    // before dismissing it — see the fixture's hydration-race comment.
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
