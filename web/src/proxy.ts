import type { NextRequest } from "next/server";
import { refreshSession } from "@/data/session";

// Session refresh only. Pages and actions check access themselves (data/viewer).
export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|data/|api/jobs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)"],
};
