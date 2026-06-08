import { expect, test } from "@playwright/test";

/**
 * Unauthenticated smoke — boots the app, proves the health probe answers and
 * that the auth gate redirects. No Clerk session needed, so this always runs.
 */
test("health endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: "ok" });
});

test("an unauthenticated visit to a guarded route is sent to sign-in", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/sign-in/);
});
