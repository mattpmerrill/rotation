import "server-only";
import { z } from "zod";

/**
 * Server environment, validated on first use. Only the data layer and the jobs read
 * process.env (Next.js data-security guidance), so secrets can't leak into components.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Secret key for the scheduled job (reads every entry, records sent notifications). */
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  /** Bearer token the scheduler sends to /api/jobs/daily. */
  CRON_SECRET: z.string().min(16).optional(),
  /** The group's Discord channel. Without it, notifications are skipped. */
  DISCORD_WEBHOOK_URL: z.url().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  cached ??= schema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || undefined,
  });
  return cached;
}
