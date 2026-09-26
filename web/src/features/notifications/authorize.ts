import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/data/env";

/** True only for "Bearer <CRON_SECRET>". Always false if the secret isn't configured. */
export function authorizeJob(header: string | null): boolean {
  const secret = env().CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
