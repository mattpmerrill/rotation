// Guard: source files and folders are kebab-case (engineering-standards.md, code conventions).
//
// A ratchet, like the query-location guard in the standards: files that already break the rule
// are listed in filenames.exempt.json. The list may only shrink. This guard fails when
//   - a file or folder breaks the rule and is not on the list (a new violation), or
//   - a path on the list no longer breaks the rule or no longer exists (delete the entry).
// Run: node scripts/guards/filenames.mjs   (part of `npm run check`)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The parts of a name that are not the stem: `.test`, `.schema`, `.repository`, `.d`, and the extension. */
function stemOf(name) {
  return name.replace(/\.(?:test|schema|repository|d)(?=\.)/g, "").replace(/\.[^.]+$/, "");
}

/** Next.js route syntax is allowed in folder names: (group), [param], [...rest], @slot. */
const ROUTE_FOLDER = /^(?:\([a-z0-9-]+\)|\[\.{0,3}[a-z0-9-]+\]|@[a-z0-9-]+)$/;

/** Generated files are owned by their generator. */
const GENERATED = new Set(["src/data/database.types.ts"]);

/** True if `path` (relative, forward slashes) has a segment that is not kebab-case. */
export function violates(path) {
  if (GENERATED.has(path)) return false;
  const parts = path.split("/");
  return parts.some((part, i) => {
    const isFile = i === parts.length - 1;
    if (!isFile && ROUTE_FOLDER.test(part)) return false;
    return !KEBAB.test(isFile ? stemOf(part) : part);
  });
}

/** Every file path under `dir` (relative to `root`, forward slashes). */
export function listFiles(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return listFiles(root, full);
    return [relative(root, full).split(sep).join("/")];
  });
}
const sep = join("a", "b").includes("\\") ? "\\" : "/";

/** Compare the tree with the exemption list. Returns human-readable problems. */
export function check(files, exempt) {
  const bad = files.filter(violates);
  const exemptSet = new Set(exempt);
  const problems = [];
  for (const f of bad) if (!exemptSet.has(f)) problems.push(`not kebab-case: ${f}`);
  for (const f of exempt) {
    if (!files.includes(f)) problems.push(`stale exemption (file is gone): ${f}`);
    else if (!violates(f)) problems.push(`stale exemption (now kebab-case, remove it): ${f}`);
  }
  return problems;
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const webRoot = join(here, "..", "..");
  const files = listFiles(join(webRoot, "src")).map((f) => `src/${f}`);
  const exemptFile = join(here, "filenames.exempt.json");
  if (process.argv.includes("--write-exemptions")) {
    // Only for the first run of the ratchet. Never use it to add a new violation to the list.
    writeFileSync(exemptFile, `${JSON.stringify(files.filter(violates).sort(), null, 2)}\n`);
    console.log("filenames guard: exemption list written");
    process.exit(0);
  }
  const exempt = JSON.parse(readFileSync(exemptFile, "utf8"));
  const problems = check(files, exempt);
  if (problems.length) {
    console.error(`filenames guard: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`filenames guard: ok (${exempt.length} legacy names still to rename)`);
}
