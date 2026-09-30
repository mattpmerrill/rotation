import { expect, test } from "@playwright/test";

// The hardening headers (the security standard). They run against a production build, or against production
// itself after a deploy, so nothing here names a specific Supabase project.

const nonceOf = (policy: string | undefined) => /'nonce-([^']+)'/.exec(policy ?? "")?.[1];

test("a page carries the standard hardening headers and no framework banner", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("a page's Content-Security-Policy forbids framing and runs scripts only with its nonce", async ({ request }) => {
  const res = await request.get("/login");
  const policy = res.headers()["content-security-policy"];
  expect(policy).toBeDefined();
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'self'");
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  const nonce = nonceOf(policy);
  expect(nonce).toBeTruthy();
  // Next.js put the same nonce on the scripts it rendered: that is what lets them run
  expect(await res.text()).toContain(`nonce="${nonce}"`);
});

test("every request gets a new nonce", async ({ request }) => {
  const [a, b] = [await request.get("/login"), await request.get("/login")];
  const nonces = [nonceOf(a.headers()["content-security-policy"]), nonceOf(b.headers()["content-security-policy"])];
  expect(nonces[0]).toBeTruthy();
  expect(nonces[0]).not.toBe(nonces[1]);
});

test("the not-found page and the API carry the headers too", async ({ request }) => {
  const missing = await request.get("/no-such-page");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  const health = await request.get("/api/health");
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  expect(health.headers()["x-powered-by"]).toBeUndefined();
});

test("the sign-in page loads and works with the policy on: no violation, and the client scripts ran", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective}: ${e.blockedURI}`));
  });
  await page.goto("/login");
  // This button only exists once React has hydrated, so a blocked script would fail here
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByLabel("Your name")).toBeVisible();
  const violations = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
  expect(violations).toEqual([]);
});
