import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, COIN_IMAGE_HOSTS, newNonce, staticSecurityHeaders } from "./security-headers";

const options = { nonce: "abc123", supabaseUrl: "https://proj.supabase.co/" };

function directive(policy: string, name: string): string[] {
  const found = policy.split("; ").find((d) => d.startsWith(`${name} `) || d === name);
  return found ? found.split(" ").slice(1) : [];
}

describe("buildContentSecurityPolicy", () => {
  const policy = buildContentSecurityPolicy(options);

  it("lets scripts run only with the request's nonce", () => {
    expect(directive(policy, "script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows inline style elements only with the nonce, and inline style attributes", () => {
    expect(directive(policy, "style-src")).toEqual(["'self'", "'nonce-abc123'"]);
    expect(directive(policy, "style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("allows the coin icon hosts, data and blob images, and nothing else for images", () => {
    expect(directive(policy, "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      ...COIN_IMAGE_HOSTS.map((h) => `https://${h}`),
    ]);
  });

  it("names the Supabase origin (not its path) and Google for sign-in", () => {
    expect(directive(policy, "connect-src")).toEqual(["'self'", "https://proj.supabase.co"]);
    expect(directive(policy, "form-action")).toEqual([
      "'self'",
      "https://proj.supabase.co",
      "https://accounts.google.com",
    ]);
  });

  it("forbids framing, plugins and a changed base URL", () => {
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
  });

  it("loosens only what `next dev` needs, and only in development", () => {
    const dev = buildContentSecurityPolicy({ ...options, development: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "style-src")).toContain("'unsafe-inline'");
    expect(directive(policy, "style-src")).not.toContain("'unsafe-inline'");
  });

  it("makes a different nonce every time", () => {
    expect(newNonce()).not.toBe(newNonce());
    expect(newNonce()).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
  });

  it("rejects a Supabase URL that is not a URL", () => {
    expect(() => buildContentSecurityPolicy({ ...options, supabaseUrl: "not a url" })).toThrow();
  });
});

describe("staticSecurityHeaders", () => {
  it("carries the standard hardening headers", () => {
    const byKey = Object.fromEntries(staticSecurityHeaders.map((h) => [h.key, h.value]));
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toContain("camera=()");
    expect(byKey["Strict-Transport-Security"]).toContain("max-age=");
  });
});
