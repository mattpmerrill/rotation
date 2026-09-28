import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// WCAG 2.2 AA (frontend.md), gated at serious and critical. Signed-out pages only: the signed-in
// pages need a signed-in journey, which is a recorded exception in docs/exceptions.md.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// A gate that cannot fail proves nothing: feed axe a page with known violations and make sure it
// reports them, so a broken setup (wrong tags, nothing scanned) shows up here.
test("the accessibility check catches a known violation", async ({ page }) => {
  await page.setContent('<html lang="en"><body><main><img src="x.png"><button></button></main></body></html>');
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => v.id)).toEqual(expect.arrayContaining(["image-alt", "button-name"]));
});

for (const path of ["/login", "/no-such-page"]) {
  test(`${path} has no serious or critical accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`),
    ).toEqual([]);
  });
}

test("the sign-in form can be completed with the keyboard alone", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  const reached: string[] = [];
  for (let i = 0; i < 8; i++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement;
      return el
        ? `${el.tagName.toLowerCase()}:${(el.getAttribute("type") ?? el.textContent ?? "").trim().slice(0, 30)}`
        : "";
    });
    reached.push(label);
    await page.keyboard.press("Tab");
  }
  expect(reached.some((r) => r.startsWith("input:email"))).toBe(true);
  expect(reached.some((r) => r.startsWith("input:password"))).toBe(true);
  expect(reached.some((r) => r.toLowerCase().includes("google"))).toBe(true);
});
