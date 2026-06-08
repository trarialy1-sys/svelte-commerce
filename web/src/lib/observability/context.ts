import "server-only";

import * as Sentry from "@sentry/nextjs";

/**
 * Attach the ONLY context allowed to leave the app to third-party monitoring:
 * `userId` (as the Sentry user id) and `orgId` (as a tag). Called per request
 * from the auth resolver. Everything else is scrubbed by `beforeSend`.
 */
export function setSentryContext(ctx: {
  orgId?: string | null;
  userId?: string | null;
}): void {
  if (ctx.userId) Sentry.setUser({ id: ctx.userId });
  if (ctx.orgId) Sentry.setTag("orgId", ctx.orgId);
}
