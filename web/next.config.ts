import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

// This Next.js app lives in a subfolder (web/) of a repo that also holds an
// unrelated SvelteKit project at the root. Pin BOTH the Turbopack root and the
// output-file-tracing root to this folder so Next never infers the parent repo
// (and its lockfile) — Next requires the two to be equal or the build errors.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

// Source-map upload + release tagging. Org/project/token come from env; when
// SENTRY_AUTH_TOKEN is unset (local builds) the plugin is a no-op, so the build
// works without any Sentry account configured.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Upload a wider set of client files for better stack traces.
  widenClientFileUpload: true,
  // Route Sentry requests through the app to dodge ad-blockers (no PII; the
  // matcher in proxy.ts leaves this path public).
  tunnelRoute: "/monitoring",
});
