import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authed by Inngest's signing key (INNGEST_SIGNING_KEY), not CRON_SECRET.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
