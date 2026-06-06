import type { NextConfig } from "next";
import path from "node:path";

// This Next.js app lives in a subfolder (web/) of a repo that also holds an
// unrelated SvelteKit project at the root. Pin the workspace root to this
// folder so Turbopack doesn't infer the parent repo (and its lockfile), and
// keep outputFileTracingRoot aligned so Next doesn't warn about a mismatch.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: {
    root,
  },
  outputFileTracingRoot: root,
};

export default nextConfig;
