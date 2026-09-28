import type { NextRequest } from "next/server";
import { confirmFromRequest } from "@/features/auth/callback";

/** A sign-in help link from an admin lands here: it signs the person in and sends them to
 *  choose a new password. */
export function GET(request: NextRequest) {
  return confirmFromRequest(request);
}
