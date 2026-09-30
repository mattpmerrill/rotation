// Guard: .env.example lists exactly the variables src/data/env.ts reads (the configuration standard:
// "`.env.example` lists every variable the app reads ... updated in the same commit").
// Run: node scripts/guards/env-example.mjs   (part of `npm run check`)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Variable names read as `process.env.NAME` in the source text. */
export function variablesRead(source) {
  return [...new Set([...source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]))].sort();
}

/** Variable names assigned (`NAME=`), whether or not commented out, in an env example file. */
export function variablesListed(example) {
  return [...new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]))].sort();
}

export function check(read, listed) {
  return [
    ...read.filter((v) => !listed.includes(v)).map((v) => `read by env.ts but missing from .env.example: ${v}`),
    ...listed.filter((v) => !read.includes(v)).map((v) => `listed in .env.example but never read: ${v}`),
  ];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const read = variablesRead(readFileSync(join(root, "src/data/env.ts"), "utf8"));
  const listed = variablesListed(readFileSync(join(root, ".env.example"), "utf8"));
  const problems = check(read, listed);
  if (problems.length) {
    console.error(`env-example guard: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`env-example guard: ok (${read.length} variables)`);
}
