import { NextResponse } from "next/server";

// GeM portal geo-blocks all non-Indian cloud IPs (Vercel included).
// Scanning is handled natively in the Electron desktop app via IPC (gem-scan handler).
// This route is kept as a stub so web users get a clear error instead of a hang.
export async function POST() {
  return NextResponse.json(
    { status: "unavailable", error: "GeM scanning requires the Invio desktop app." },
    { status: 200 }
  );
}
