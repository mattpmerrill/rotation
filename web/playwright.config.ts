import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for what a signed-out visitor sees. They run against `E2E_BASE_URL` when it is
 * set (the post-deploy check points it at production), otherwise against a production build served
 * locally: `npm run build && npm run e2e`.
 *
 * A signed-in journey needs a Supabase project to sign in to; it is a recorded exception in
 * docs/exceptions.md until the local stack runs in CI.
 */
const external = process.env.E2E_BASE_URL;
const port = 3187;
const signedIn = process.env.E2E_SIGNED_IN === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: !signedIn,
  ...(signedIn ? { workers: 1 } : {}),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  // The signed-in journey needs a real Supabase, so it is its own project, on only when
  // E2E_SIGNED_IN=1 (see e2e/signed-in/support.ts). Everything else is what a visitor sees.
  projects: signedIn
    ? [{ name: "signed-in", testMatch: /signed-in\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "desktop", testIgnore: /signed-in/, use: { ...devices["Desktop Chrome"] } },
        { name: "phone", testIgnore: /signed-in/, use: { ...devices["Pixel 7"] } },
      ],
  ...(external
    ? {}
    : {
        webServer: {
          command: `npm run start -- --port ${port}`,
          url: `http://localhost:${port}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          // The build needs the public settings to exist, not to be real: nothing here signs in.
          env: {
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "ci",
            ...(process.env.SUPABASE_SECRET_KEY ? { SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY } : {}),
          },
        },
      }),
});
