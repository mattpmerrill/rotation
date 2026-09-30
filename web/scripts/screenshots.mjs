// Takes the README screenshots: `npm run screenshots` from web/.
//
// It needs the local stack with the demo seed (`supabase start`; `supabase db reset` loads
// supabase/seed.sql), builds the app against it, serves the build on port 3188, signs in as demo
// people in a headless browser and writes docs/screenshots/<page>-<desktop|mobile>.png.
//
// The Supabase settings come from the environment (NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) or, when those are not set, from `supabase status`.
// Flags: --skip-build reuses the existing build; --only=leaderboard,entry limits the pages.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.resolve(webDir, "..");
const outDir = path.join(repoDir, "docs", "screenshots");
const port = 3188;
const base = `http://localhost:${port}`; // localhost, not 127.0.0.1: the auth cookie is host-specific
const password = "rotation-demo-2026"; // the local-only password set by supabase/seed/build_seed.py

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const only = args
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",");

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

/** Who is signed in for each shot, and where. `desktopOnly` pages get no phone image; `tall` takes the first N px of the page instead of one screen. */
const SHOTS = [
  { name: "leaderboard", as: "ava", path: "/", wait: "sparklines" },
  { name: "entry", as: "cal", path: "entry", wait: "charts", tall: { desktop: 1500, mobile: 1400 } },
  {
    name: "pick",
    as: "eli",
    path: "/pick",
    wait: "images",
    choose: ["SOL", "HYPE", "LINK", "AAVE"],
    tall: { desktop: 1700, mobile: 1500 },
  },
  { name: "picks", as: "ava", path: "/picks", wait: "charts", tall: { desktop: 1300, mobile: 1700 } },
  { name: "timing", as: "ava", path: "/timing", wait: "charts", tall: { desktop: 1500, mobile: 1800 } },
  { name: "admin", as: "sam", path: "/admin", wait: "images", desktopOnly: true },
  { name: "login", as: null, path: "/login", wait: "images" },
];

function supabaseSettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) return { url, key };
  let raw;
  try {
    raw = execFileSync("supabase", ["status", "-o", "env"], { cwd: repoDir, encoding: "utf8" });
  } catch {
    throw new Error(
      "No Supabase settings: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or run `supabase start`.",
    );
  }
  const env = Object.fromEntries([...raw.matchAll(/^([A-Z_]+)="?(.*?)"?$/gm)].map((m) => [m[1], m[2]]));
  const found = { url: env.API_URL, key: env.PUBLISHABLE_KEY ?? env.ANON_KEY };
  if (!found.url || !found.key)
    throw new Error("`supabase status` did not report the API URL and key. Is the stack running?");
  return found;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`The app did not come up on ${base}`);
}

/** Everything a person would wait for before looking: fonts, images, charts, and no spinner. */
async function settle(page, wait) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Only images in the first screen: the ones below it are lazy-loaded and the shot never shows them.
  await page.waitForFunction(
    () =>
      [...document.images]
        .filter((i) => i.getBoundingClientRect().top < window.innerHeight)
        .every((i) => i.complete && i.naturalWidth > 0),
    null,
    { timeout: 20_000 },
  );
  if (wait === "charts") await page.locator(".recharts-surface").first().waitFor({ timeout: 20_000 });
  if (wait === "sparklines") await page.locator("svg").nth(1).waitFor({ timeout: 20_000 });
  await page
    .locator('[role="status"]')
    .first()
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(wait === "charts" ? 2500 : 600); // chart draw-in animation
}

async function signIn(browser, who) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Email").fill(`${who}@example.test`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("navigation", { name: "Main" }).waitFor({ timeout: 20_000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

async function optimize(file) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return; // sharp ships with Next.js; without it the PNGs are simply larger
  }
  const before = statSync(file).size;
  const smaller = await sharp(file).png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toBuffer();
  if (smaller.length < before) writeFileSync(file, smaller);
}

async function main() {
  const { url, key } = supabaseSettings();
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };

  if (!skipBuild) execFileSync("npm", ["run", "build"], { cwd: webDir, env, stdio: "inherit" });

  // The app falls back to daily closes when CoinGecko cannot be reached. Cutting it off keeps the
  // shots the same on every run and independent of the network and of the day's prices.
  const server = spawn(path.join(webDir, "node_modules", ".bin", "next"), ["start", "--port", String(port)], {
    cwd: webDir,
    env: { ...env, NODE_OPTIONS: `--import ${path.join(webDir, "scripts", "screenshots-offline.mjs")}` },
    stdio: ["ignore", "inherit", "inherit"],
  });
  let browser;
  try {
    await waitForServer();
    mkdirSync(outDir, { recursive: true });
    browser = await chromium.launch();
    const states = {};
    const shots = SHOTS.filter((s) => !only || only.includes(s.name));
    for (const who of new Set(shots.map((s) => s.as).filter(Boolean))) states[who] = await signIn(browser, who);

    for (const shot of shots) {
      for (const [kind, device] of [
        ["desktop", DESKTOP],
        ["mobile", MOBILE],
      ]) {
        if (kind === "mobile" && shot.desktopOnly) continue;
        const context = await browser.newContext({ ...device, ...(shot.as ? { storageState: states[shot.as] } : {}) });
        const page = await context.newPage();
        let target = shot.path;
        if (target === "entry") {
          // the signed-in person's own basket, through the nav link
          await page.goto(base);
          await page.getByRole("link", { name: "My basket" }).first().click();
          await page.waitForURL(/\/entries\/\d+/);
        } else {
          await page.goto(`${base}${target}`);
        }
        for (const symbol of shot.choose ?? []) {
          await page.getByRole("button", { name: new RegExp(`^#\\d+\\s*${symbol}\\b`) }).click();
        }
        await settle(page, shot.wait);
        // clicking scrolled the page and the coin list; the sticky header would land mid-image
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.querySelectorAll("ul").forEach((u) => (u.scrollTop = 0));
        });
        await page.mouse.move(0, 0);
        await page.waitForTimeout(300);
        const file = path.join(outDir, `${shot.name}-${kind}.png`);
        await page.screenshot({
          path: file,
          ...(shot.tall
            ? { fullPage: true, clip: { x: 0, y: 0, width: device.viewport.width, height: shot.tall[kind] } }
            : {}),
        });
        await optimize(file);
        console.log(`${path.relative(repoDir, file)}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
