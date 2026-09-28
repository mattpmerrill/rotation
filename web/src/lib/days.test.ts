import { describe, expect, it } from "vitest";
import { earlierDay, laterDay } from "./days";

describe("laterDay and earlierDay", () => {
  it("pick by calendar order, whichever way round they are given", () => {
    expect(laterDay("2026-09-01", "2026-10-01")).toBe("2026-10-01");
    expect(laterDay("2026-10-01", "2026-09-01")).toBe("2026-10-01");
    expect(earlierDay("2026-09-01", "2026-10-01")).toBe("2026-09-01");
    expect(earlierDay("2026-10-01", "2026-09-01")).toBe("2026-09-01");
  });

  it("agree when the days are equal", () => {
    expect(laterDay("2026-09-01", "2026-09-01")).toBe("2026-09-01");
    expect(earlierDay("2026-09-01", "2026-09-01")).toBe("2026-09-01");
  });
});
