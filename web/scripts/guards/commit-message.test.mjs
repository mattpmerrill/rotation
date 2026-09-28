import { describe, expect, it } from "vitest";
import { problems } from "./commit-message.mjs";

describe("commit message guard", () => {
  it("accepts an area-prefixed subject with a body and trailers", () => {
    expect(problems("web: add the health endpoint\n\nWhy it matters.\n\nCo-Authored-By: Someone <a@b.c>\n")).toEqual(
      [],
    );
    expect(problems("supabase/migrations: name files after production\n")).toEqual([]);
    expect(problems("repo: pin Node 22")).toEqual([]);
  });

  it("accepts merge, revert and fixup subjects that git generates", () => {
    for (const s of ['Merge branch "x"', 'Revert "web: add x"', "fixup! web: add x"]) expect(problems(s)).toEqual([]);
  });

  it("rejects subjects with no area, and the ones the standards name as useless", () => {
    for (const s of ["fix bug", "updates", "wip", "Add the health endpoint", "web:no space", "Web: capitalised area"])
      expect(problems(s), s).toHaveLength(1);
  });

  it("rejects an em-dash or en-dash anywhere, but ignores comment lines", () => {
    expect(problems("web: add x — with a dash")).toHaveLength(1);
    expect(problems("web: add x\n\nA body with an en–dash.")).toHaveLength(1);
    expect(problems("web: add x\n# a git comment with — is stripped by git\n")).toEqual([]);
  });

  it("checks the Exception trailer format", () => {
    expect(problems("web: skip a rule\n\nException: no service layer - legacy action - expires 2026-10-31\n")).toEqual(
      [],
    );
    expect(problems("web: skip a rule\n\nException: legacy\n")).toHaveLength(1);
    expect(problems("web: skip a rule\n\nException: a rule - a reason - expires soon\n")).toHaveLength(1);
  });

  it("reports every problem at once", () => {
    expect(problems("oops — no area\n\nException: x")).toHaveLength(3);
  });
});
