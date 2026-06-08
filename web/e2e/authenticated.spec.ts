import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * Critical authenticated journeys. Requires a Clerk TEST user (admin/owner in a
 * test org) — set E2E_CLERK_USER_EMAIL / _PASSWORD (and the Clerk test keys).
 * Skipped otherwise so the suite stays green until E2E secrets are wired.
 *
 * External calls (Ozon/Shopify/Resend) must be mocked in the running instance;
 * these specs only exercise navigation + server-side role gating, never a live
 * parcel send.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const password = process.env.E2E_CLERK_USER_PASSWORD;

test.describe("authenticated journeys (admin/owner)", () => {
  test.skip(!email || !password, "set E2E_CLERK_USER_EMAIL/PASSWORD to enable");

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({
      page,
      signInParams: { strategy: "password", identifier: email!, password: password! },
    });
  });

  test("dashboard renders and exposes the admin-only Finance nav", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /tableau de bord/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /finance/i })).toBeVisible();
  });

  test("reports section loads for admin+", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: /rapports/i })).toBeVisible();
    // Switching report tabs keeps the section mounted.
    await page.getByRole("link", { name: /par ville/i }).click();
    await expect(page).toHaveURL(/\/reports\/villes/);
  });
});
