// Sentry init for the Edge runtime (the Clerk proxy/middleware). Loaded by
// `src/instrumentation.ts` when NEXT_RUNTIME === "edge".
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@/lib/observability/sentry-options";

Sentry.init({ ...baseSentryOptions });
