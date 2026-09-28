import { describe, expect, it } from "vitest";
import { z } from "zod";
import { firstIssue } from "./first-issue";

describe("firstIssue", () => {
  it("returns the first message of a failed parse", () => {
    const parsed = z.object({ n: z.number("Enter a number.") }).safeParse({ n: "x" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssue(parsed.error)).toBe("Enter a number.");
  });

  it("has a fallback when there are no issues", () => {
    expect(firstIssue({ issues: [] })).toBe("Check the form and try again.");
  });
});
