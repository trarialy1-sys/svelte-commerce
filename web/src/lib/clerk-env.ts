/**
 * Clerk key access, hardened against a common deployment footgun: env values
 * pasted with surrounding quotes or stray whitespace (e.g. `"pk_test_…"`),
 * which make Clerk throw "Publishable key not valid".
 *
 * We read the keys here, strip wrapping quotes/whitespace, and pass them
 * explicitly to `clerkMiddleware` and `<ClerkProvider>` so a malformed env
 * value can't take down the app.
 */
function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^["']+|["']+$/g, "").trim();
  return trimmed || undefined;
}

export const clerkPublishableKey = clean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);
