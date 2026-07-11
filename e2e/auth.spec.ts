import { expect, test } from "@playwright/test";

test.describe("Authentication gate", () => {
  test("an unauthenticated visit to /inbox redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the login screen offers Google and Microsoft sign-in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Meet NovaMail")).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue with Google/ })).toHaveAttribute(
      "href",
      "/api/v1/auth/google",
    );
    await expect(
      page.getByRole("link", { name: /Continue with Microsoft/ }),
    ).toHaveAttribute("href", "/api/v1/auth/microsoft");
  });

  test("surfaces the callback error message when redirected with ?error=", async ({
    page,
  }) => {
    await page.goto("/login?error=cancelled");
    await expect(page.getByText(/Sign-in was cancelled/)).toBeVisible();
  });
});
