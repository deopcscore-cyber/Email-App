import { expect, test } from "./fixtures";

test.describe("Compose, send, and undo", () => {
  test("composes a new email and sends it with an undo toast", async ({
    signedInPage: page,
  }) => {
    await page.getByRole("button", { name: "Compose" }).click();
    const dialog = page.getByRole("dialog", { name: "New message" });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("To recipients").fill("sarah@acme.com");
    await page.keyboard.press("Enter");
    await expect(dialog.getByText("sarah@acme.com")).toBeVisible();

    await dialog.getByLabel("Subject").fill("E2E send test");
    await dialog.getByLabel("Message body").click();
    await page.keyboard.type("This message is sent by the e2e suite.");

    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    const toast = page.getByText("Sending…");
    await expect(toast).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("Undo restores the message as an editable draft", async ({ signedInPage: page }) => {
    await page.getByRole("button", { name: "Compose" }).click();
    const dialog = page.getByRole("dialog", { name: "New message" });
    await dialog.getByLabel("To recipients").fill("alex@brightlabs.io");
    await page.keyboard.press("Enter");
    await dialog.getByLabel("Subject").fill("Undo me");
    await dialog.getByRole("button", { name: "Send", exact: true }).click();

    await page.getByRole("button", { name: "Undo" }).click();

    const reopened = page.getByRole("dialog", { name: /New message|Reply/ });
    await expect(reopened).toBeVisible();
    await expect(reopened.getByLabel("Subject")).toHaveValue("Undo me");
    await expect(page.getByText("Sending…")).not.toBeVisible();
  });

  test("reply pre-addresses the compose window to the sender", async ({
    signedInPage: page,
  }) => {
    const list = page.getByRole("listbox", { name: /conversations/ });
    await list.getByRole("option").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.keyboard.press("r");

    const dialog = page.getByRole("dialog", { name: "Reply" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Subject")).toHaveValue(/^Re: /);
  });
});
