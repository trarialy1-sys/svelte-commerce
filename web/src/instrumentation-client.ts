// Sentry init for the browser. Next.js loads `instrumentation-client.ts`
// automatically on the client; `onRouterTransitionStart` wires App-Router
// navigations into Sentry's tracing.
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@/lib/observability/sentry-options";

Sentry.init({
  ...baseSentryOptions,
  // Browser-only: capture Web Vitals + navigation/pageload spans (Pass B).
  integrations: [Sentry.browserTracingIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
