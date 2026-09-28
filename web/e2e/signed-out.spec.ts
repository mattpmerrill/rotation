import { expect, test } from "@playwright/test";

// What a visitor who is not signed in sees. The challenge is invite-only: everything except the
// sign-in page must send them there, and nothing about a member's basket may render.

test("the sign-in page shows the pitch and both ways in", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/Sign in/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("1 Bitty");
  await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByText(/invite from Matt/i)).toBeVisible();
});

for (const path of ["/", "/pick", "/picks", "/timing", "/entries/1", "/entries/1/edit"]) {
  test(`${path} sends a signed-out visitor to sign in and shows no member content`, async ({ page }) => {
    await page.goto(path);
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("1 Bitty");
    // the signed-in header (main navigation, sign out) must not render for a visitor
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
  });
}

test("the daily job refuses a caller without the secret", async ({ request }) => {
  const noHeader = await request.post("/api/jobs/daily");
  expect(noHeader.status()).toBe(401);
  const wrong = await request.post("/api/jobs/daily", { headers: { authorization: "Bearer not-the-secret" } });
  expect(wrong.status()).toBe(401);
});

test("the health endpoint reports the app is up, and nothing else", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(["commit", "ok"]);
  expect(body.ok).toBe(true);
});

test("an unknown page says so and offers a way back", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /that page isn.t here/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /back to the leaderboard/i })).toBeVisible();
});
