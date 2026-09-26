import { NextResponse, type NextRequest } from "next/server";
import { runDailyJob } from "@/features/notifications/job";
import { authorizeJob } from "@/features/notifications/authorize";
import { todayUtc } from "@/lib/days";

/** The scheduler (GitHub Actions, after the engine's price update) calls this once a day. */
export async function POST(request: NextRequest) {
  if (!authorizeJob(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await runDailyJob(todayUtc(), new URL("/", request.url).toString());
  return NextResponse.json({ sent });
}
