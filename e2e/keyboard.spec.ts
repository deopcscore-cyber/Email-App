import { expect, test } from "./fixtures";

test.describe("Keyboard-first navigation", () => {
  test("j/k moves the focus rail between rows", async ({ signedInPage: page }) => {
    const list = page.getByRole("listbox", { name: /conversations/ });
    const rows = list.getByRole("option");
    await expect(rows.first()).toBeVisible();

    await page.keyboard.press("j");
    await expect(rows.nth(1)).toHaveAttribute("data-focused", "true");

    await page.keyboard.press("j");
    await expect(rows.nth(2)).toHaveAttribute("data-focused", "true");

    await page.keyboard.press("k");
    await expect(rows.nth(1)).toHaveAttribute("data-focused", "true");
  });

  test("Enter opens the focused row in the reading pane", async ({ signedInPage: page }) => {
    const rows = page.getByRole("listbox", { name: /conversations/ }).getByRole("option");
    await page.keyboard.press("j");
    // Wait for the focus-rail state update to land before opening it — two
    // keystrokes fired back-to-back would otherwise race React's render.
    await expect(rows.nth(1)).toHaveAttribute("data-focused", "true");

    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("c opens compose and Escape closes it", async ({ signedInPage: page }) => {
    await page.keyboard.press("c");
    const dialog = page.getByRole("dialog", { name: "New message" });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("/ opens the command palette", async ({ signedInPage: page }) => {
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog", { name: "Search and commands" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("? opens the keyboard shortcuts help modal", async ({ signedInPage: page }) => {
    await page.keyboard.press("Shift+?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  });

  test("single-key shortcuts are suppressed while typing in compose", async ({
    signedInPage: page,
  }) => {
    await page.keyboard.press("c");
    const dialog = page.getByRole("dialog", { name: "New message" });
    await dialog.getByLabel("To recipients").fill("earchive");
    // "e" should have been typed into the field, not triggered as Archive.
    await expect(dialog.getByLabel("To recipients")).toHaveValue("earchive");
    await expect(dialog).toBeVisible();
  });
});
