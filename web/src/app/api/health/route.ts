import { NextResponse } from "next/server";
import { healthStatus } from "@/features/health/status";

/** Liveness, and which commit is deployed. The post-deploy check waits for it to report the pushed commit. */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(healthStatus(), { headers: { "cache-control": "no-store" } });
}
