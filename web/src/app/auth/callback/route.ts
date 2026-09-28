import type { NextRequest } from "next/server";
import { completeSignInFromRequest } from "@/features/auth/callback";

export function GET(request: NextRequest) {
  return completeSignInFromRequest(request);
}
