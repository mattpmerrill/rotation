import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("keeps a same-site path, including its query", () => {
    expect(safeNextPath("/entries/4")).toBe("/entries/4");
    expect(safeNextPath("/pick?x=1")).toBe("/pick?x=1");
  });

  it("falls back when there is nothing to follow", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null, "/pick")).toBe("/pick");
  });

  it("never sends the visitor to another site", () => {
    for (const evil of [
      "https://evil.example",
      "http://evil.example/x",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil.example/path",
    ])
      expect(safeNextPath(evil), evil).toBe("/");
  });
});
