import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 uses Turbopack by default — empty config silences the webpack conflict warning
  turbopack: {},
};

export default nextConfig;
