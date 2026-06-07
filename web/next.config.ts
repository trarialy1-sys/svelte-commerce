import type { NextConfig } from "next";
import path from "node:path";

// This Next.js app lives in a subfolder (web/) of a repo that also holds an
// unrelated SvelteKit project at the root. Pin BOTH the Turbopack root and the
// output-file-tracing root to this folder so Next never infers the parent repo
// (and its lockfile) — Next requires the two to be equal or the build errors.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
