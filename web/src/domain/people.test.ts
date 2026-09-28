import { describe, expect, it } from "vitest";
import { groupPeople, plainName, waitingMessage, type Person } from "./people";

const person = (over: Partial<Person>): Person => ({
  id: "1",
  email: "a@example.com",
  name: "Alice",
  isMember: false,
  isAdmin: false,
  signedUpAt: "2026-10-01T10:00:00Z",
  provider: "email",
  ...over,
});

describe("groupPeople", () => {
  it("puts everyone not yet approved in 'waiting', oldest first, and members apart", () => {
    const { waiting, members } = groupPeople([
      person({ id: "new", signedUpAt: "2026-10-03T00:00:00Z" }),
      person({ id: "in", isMember: true }),
      person({ id: "old", signedUpAt: "2026-10-01T00:00:00Z" }),
    ]);
    expect(waiting.map((p) => p.id)).toEqual(["old", "new"]);
    expect(members.map((p) => p.id)).toEqual(["in"]);
  });

  it("lists admins first among the members, then by name", () => {
    const { members } = groupPeople([
      person({ id: "b", name: "Bob", isMember: true }),
      person({ id: "z", name: "Zed", isMember: true, isAdmin: true }),
      person({ id: "a", name: "Alice", isMember: true }),
    ]);
    expect(members.map((p) => p.id)).toEqual(["z", "a", "b"]);
  });
});

describe("plainName", () => {
  it("removes formatting, mention and link characters and collapses spaces", () => {
    expect(plainName("  **Al**  @everyone  [x](http://evil) ")).toBe("Al everyone xhttp://evil");
    expect(plainName("Ada_L~ovelace`")).toBe("AdaLovelace");
  });

  it("falls back when nothing is left, and caps the length", () => {
    expect(plainName("***")).toBe("Someone");
    expect(plainName("x".repeat(100))).toHaveLength(40);
  });
});

describe("waitingMessage", () => {
  it("names the person and links to the admin page, and never carries an email address", () => {
    const text = waitingMessage("Alice", "https://app.example/admin");
    expect(text).toBe("**Alice** signed up and is waiting for approval: https://app.example/admin");
    expect(text).not.toMatch(/@/);
  });

  it("cannot be used to inject formatting or a mention through the name", () => {
    expect(waitingMessage("@everyone **hi**", "https://app.example/admin")).toBe(
      "**everyone hi** signed up and is waiting for approval: https://app.example/admin",
    );
  });
});
