import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Prepares Clerk for E2E: fetches a Testing Token so the authenticated specs
 * can bypass bot protection. No-ops when Clerk env isn't configured, so the
 * unauthenticated smoke specs still run.
 */
export default async function globalSetup() {
  if (
    process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ) {
    await clerkSetup();
  }
}
