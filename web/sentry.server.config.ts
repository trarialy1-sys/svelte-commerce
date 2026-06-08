// Sentry init for the Node.js server runtime (API routes, RSC, server actions,
// Inngest functions). Loaded by `src/instrumentation.ts` via `register()`.
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@/lib/observability/sentry-options";

Sentry.init({ ...baseSentryOptions });
