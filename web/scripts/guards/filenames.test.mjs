import { describe, expect, it } from "vitest";
import { check, violates } from "./filenames.mjs";

describe("violates", () => {
  it("accepts kebab-case files and folders, including test and schema suffixes", () => {
    for (const p of [
      "src/domain/buy-in.ts",
      "src/domain/buy-in.test.ts",
      "src/features/picker/buy-in.schema.ts",
      "src/data/trades.repository.ts",
      "src/data/trades.repository.test.ts",
      "src/ui/charts/sparkline.tsx",
      "src/lib/days.ts",
      "src/proxy.ts",
    ])
      expect(violates(p), p).toBe(false);
  });

  it("accepts Next.js route syntax in folders and the route file names", () => {
    for (const p of [
      "src/app/(challenge)/page.tsx",
      "src/app/(challenge)/entries/[id]/edit/page.tsx",
      "src/app/api/jobs/daily/route.ts",
      "src/app/not-found.tsx",
    ])
      expect(violates(p), p).toBe(false);
  });

  it("refuses PascalCase, camelCase and snake_case, in files and in folders", () => {
    for (const p of [
      "src/ui/Button.tsx",
      "src/domain/buyIn.ts",
      "src/domain/buy_in.ts",
      "src/features/Picker/actions.ts",
      "src/ui/CoinIcon.test.tsx",
    ])
      expect(violates(p), p).toBe(true);
  });

  it("leaves generated database types alone", () => {
    expect(violates("src/data/database.types.ts")).toBe(false);
  });
});

describe("check", () => {
  const files = ["src/domain/buy-in.ts", "src/ui/Button.tsx", "src/ui/Card.tsx"];

  it("passes when every violation is listed", () => {
    expect(check(files, ["src/ui/Button.tsx", "src/ui/Card.tsx"])).toEqual([]);
  });

  it("fails on a new violation", () => {
    expect(check(files, ["src/ui/Button.tsx"])).toEqual(["not kebab-case: src/ui/Card.tsx"]);
  });

  it("fails on an exemption for a file that was fixed or removed", () => {
    const problems = check(["src/ui/button.tsx"], ["src/ui/Button.tsx", "src/ui/button.tsx"]);
    expect(problems).toEqual([
      "stale exemption (file is gone): src/ui/Button.tsx",
      "stale exemption (now kebab-case, remove it): src/ui/button.tsx",
    ]);
  });
});
