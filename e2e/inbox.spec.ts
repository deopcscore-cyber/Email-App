import { expect, test } from "./fixtures";

test.describe("Inbox", () => {
  test("lists the seeded threads and opens one on click", async ({ signedInPage: page }) => {
    const list = page.getByRole("listbox", { name: /conversations/ });
    await expect(list.getByRole("option").first()).toBeVisible();

    const firstSubject = await list
      .getByRole("option")
      .first()
      .locator("p")
      .first()
      .textContent();
    await list.getByRole("option").first().click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      firstSubject?.trim() ?? "",
    );
  });

  test("starring a thread from the list toggles instantly (optimistic)", async ({
    signedInPage: page,
  }) => {
    const row = page.getByRole("listbox", { name: /conversations/ }).getByRole("option").first();
    await row.hover();
    const starButton = row.getByRole("button", { name: "Star" });
    await starButton.click();
    await expect(row.getByRole("button", { name: "Unstar" })).toBeVisible();
  });

  test("archiving a thread from the reading pane removes it from the inbox list", async ({
    signedInPage: page,
  }) => {
    const list = page.getByRole("listbox", { name: /conversations/ });
    const countBefore = await list.getByRole("option").count();

    await list.getByRole("option").first().click();
    await page.getByRole("button", { name: /Archive/ }).click();

    await expect(list.getByRole("option")).toHaveCount(countBefore - 1);
  });

  test("switching to the Sent folder shows sent mail", async ({ signedInPage: page }) => {
    await page.getByRole("link", { name: "Sent" }).click();
    await expect(page).toHaveURL(/\/sent$/);
    await expect(page.getByRole("listbox", { name: /conversations/ })).toBeVisible();
  });
});
