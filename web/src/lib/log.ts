/**
 * Structured logging: one JSON object per line on stdout or stderr, which Vercel captures and makes
 * searchable (observability.md). Callers pass the facts about the event, never secrets, tokens,
 * payment details, or personal data beyond what an investigation needs.
 *
 * Not built yet: a correlation ID carried from the request into every line (exception 3 in
 * docs/exceptions.md). Until then a line says what happened and where, not which request it was.
 */
export type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
