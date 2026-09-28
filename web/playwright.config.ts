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

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  ...(external
    ? {}
    : {
        webServer: {
          command: `npm run start -- --port ${port}`,
          url: `http://127.0.0.1:${port}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          // The build needs the public settings to exist, not to be real: nothing here signs in.
          env: {
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "ci",
          },
        },
      }),
});
