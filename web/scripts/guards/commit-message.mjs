// Guard: commit messages follow version-control.md.
//   - the subject is `<area>: <what changed>`
//   - no em-dash or en-dash anywhere in the message
//   - an `Exception:` trailer reads `Exception: <rule> - <why> - expires YYYY-MM-DD`
// Run by .githooks/commit-msg with the path of the message file.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SUBJECT = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9._-]+)*: \S/;
const GENERATED_SUBJECT = /^(?:Merge |Revert |fixup! |squash! )/;
const EXCEPTION = /^Exception: .+ - .+ - expires \d{4}-\d{2}-\d{2}$/;

/** Problems with a commit message, as sentences. Empty when it conforms. */
export function problems(message) {
  const lines = message.split("\n").filter((l) => !l.startsWith("#"));
  const subject = (lines.find((l) => l.trim() !== "") ?? "").trimEnd();
  const found = [];
  if (!GENERATED_SUBJECT.test(subject) && !SUBJECT.test(subject))
    found.push(
      `The subject must be "<area>: <what changed>" (for example "web: add the health endpoint"). Got: "${subject}"`,
    );
  if (/[–—]/.test(lines.join("\n")))
    found.push("Remove the em-dash or en-dash: use a hyphen, or rewrite the sentence.");
  for (const line of lines)
    if (line.startsWith("Exception:") && !EXCEPTION.test(line.trimEnd()))
      found.push(`Write the trailer as "Exception: <rule> - <why> - expires YYYY-MM-DD". Got: "${line}"`);
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: commit-message.mjs <message-file>");
    process.exit(2);
  }
  const found = problems(readFileSync(file, "utf8"));
  if (found.length) {
    console.error(`commit message rejected (version-control.md):\n  - ${found.join("\n  - ")}`);
    process.exit(1);
  }
}
