import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 uses Turbopack by default — empty config silences the webpack conflict warning
  turbopack: {},
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "puppeteer", "puppeteer-extra", "puppeteer-extra-plugin-stealth"],
};

export default nextConfig;
