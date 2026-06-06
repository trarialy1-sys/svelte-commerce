import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This Next.js app lives in a subfolder (web/) of a repo that also holds an
  // unrelated SvelteKit project at the root. Pin the workspace root to this
  // folder so Turbopack doesn't infer the parent repo (and its lockfile).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
