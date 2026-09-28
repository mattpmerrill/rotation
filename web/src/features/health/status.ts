import "server-only";
import { env } from "@/data/env";

/** What the health endpoint reports: that the app is up, and which commit is live (Vercel sets
 *  the commit). Deliberately reads no database and returns no configuration: it is public. */
export interface HealthStatus {
  ok: true;
  commit: string | null;
}

export function healthStatus(): HealthStatus {
  return { ok: true, commit: env().VERCEL_GIT_COMMIT_SHA ?? null };
}
