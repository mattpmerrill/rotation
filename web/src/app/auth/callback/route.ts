import type { NextRequest } from "next/server";
import { completeSignIn } from "@/features/auth/callback";

export function GET(request: NextRequest) {
  return completeSignIn(request);
}
