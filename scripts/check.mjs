// The one command that runs every check (version-control.md: "the full check command").
// It is what the pre-push hook runs and what the README names. Plain Node, no shell syntax, so it
// runs the same on macOS, Linux and Windows.
//
//   node scripts/check.mjs               everything; the database step is skipped if Docker is off
//   node scripts/check.mjs --require-db  fail instead of skipping when the database can't run
//   node scripts/check.mjs --e2e         also run the browser tests (needs Playwright's browser)
//   node scripts/check.mjs --signed-in   also run the signed-in journey against the local Supabase
//                                        (needs `supabase start` and Docker)
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const isWindows = process.platform === "win32";

/** The build needs the public settings to exist, not to be real. */
const buildEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "ci",
};

function run(cmd, cmdArgs, { cwd = ".", env = {}, quiet = false } = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: join(root, cwd),
    env: { ...process.env, ...env },
    stdio: quiet ? "ignore" : "inherit",
    shell: isWindows, // npm and uv are .cmd shims on Windows
  });
}

/** The engine's tests run against an empty data cache, as CI does. The research cache exists only
 *  on Matt's laptop; a test that quietly depends on it passes here and fails on a clean checkout. */
const emptyCache = () => ({ ROTATION_DATA_DIR: mkdtempSync(join(tmpdir(), "rotation-empty-cache-")) });

/** The local Supabase's URL and keys, as the environment the app and the signed-in tests need. */
function localSupabaseEnv() {
  const r = spawnSync("supabase", ["status", "-o", "env"], { cwd: root, encoding: "utf8", shell: isWindows });
  const pick = (name) => new RegExp(`^${name}="?([^"\\n]*)"?$`, "m").exec(r.stdout ?? "")?.[1];
  const [url, publishable, secret] = [pick("API_URL"), pick("PUBLISHABLE_KEY"), pick("SECRET_KEY")];
  if (!url || !publishable || !secret) throw new Error("The local Supabase is not running: run `supabase start` first.");
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
    SUPABASE_SECRET_KEY: secret,
  };
}

const dockerRuns = () => run("docker", ["info"], { quiet: true }).status === 0;

const steps = [
  { name: "web: lint, format, types, import graph, guards, unit tests", cwd: "web", cmd: "npm", args: ["run", "check"] },
  { name: "web: production build", cwd: "web", cmd: "npm", args: ["run", "build"], env: buildEnv },
  { name: "engine: lint", cwd: "engine", cmd: "uv", args: ["run", "ruff", "check", "src", "tests"] },
  { name: "engine: format", cwd: "engine", cmd: "uv", args: ["run", "ruff", "format", "--check", "src", "tests"] },
  { name: "engine: types", cwd: "engine", cmd: "uv", args: ["run", "mypy"] },
  { name: "engine: config", cwd: "engine", cmd: "uv", args: ["run", "rotation", "config"] },
  { name: "engine: tests (empty data cache, as CI)", cwd: "engine", cmd: "uv", args: ["run", "pytest", "-q"], env: emptyCache() },
  { name: "database: pgTAP access and fairness tests", cmd: "supabase", args: ["test", "db"], needsDocker: true },
  ...(args.has("--e2e")
    ? [{ name: "web: browser tests", cwd: "web", cmd: "npm", args: ["run", "e2e"], env: buildEnv }]
    : []),
  ...(args.has("--signed-in")
    ? [
        { name: "web: build against the local Supabase", cwd: "web", cmd: "npm", args: ["run", "build"], env: localSupabaseEnv },
        {
          name: "web: signed-in journey (local Supabase)",
          cwd: "web",
          cmd: "npm",
          args: ["run", "e2e"],
          env: () => ({ ...localSupabaseEnv(), E2E_SIGNED_IN: "1" }),
        },
      ]
    : []),
];

const results = [];
for (const step of steps) {
  process.stdout.write(`\n=== ${step.name}\n`);
  if (step.needsDocker && !dockerRuns()) {
    const msg = "Docker is not running, so this step could not run.";
    if (args.has("--require-db")) {
      console.error(`FAILED: ${msg}`);
      results.push({ name: step.name, status: "FAILED" });
    } else {
      console.warn(`SKIPPED: ${msg} CI runs it on every push. Start Docker and re-run to check it here.`);
      results.push({ name: step.name, status: "SKIPPED" });
    }
    continue;
  }
  const started = Date.now();
  let env;
  try {
    env = typeof step.env === "function" ? step.env() : step.env;
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    results.push({ name: step.name, status: "FAILED" });
    continue;
  }
  const r = run(step.cmd, step.args, { cwd: step.cwd, env });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  results.push({ name: step.name, status: r.status === 0 ? "passed" : "FAILED", seconds });
}

console.log("\n=== Summary");
for (const r of results) console.log(`${r.status.padEnd(8)} ${r.name}${r.seconds ? `  (${r.seconds}s)` : ""}`);
const failed = results.filter((r) => r.status === "FAILED").length;
const skipped = results.filter((r) => r.status === "SKIPPED").length;
if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(skipped ? `\nAll checks that could run passed; ${skipped} skipped (see above).` : "\nAll checks passed.");
