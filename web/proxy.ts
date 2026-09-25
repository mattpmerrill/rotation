import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Session refresh only. Every private page still checks the user itself (lib/supabase/server).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|explorer.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
