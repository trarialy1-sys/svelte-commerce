import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook. Loads the Sentry config for whichever server
 * runtime booted, and forwards nested RSC / route-handler errors to Sentry via
 * `onRequestError` (the recommended setup for the App Router).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
