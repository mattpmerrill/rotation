import { expect, test } from "@playwright/test";
import { admin, createAccountWithEmail, createAdmin, newPerson, signInWithEmail, uniqueEmail, notice } from "./support";

// The whole journey a friend takes, against a real Supabase: sign up with email, wait, get approved,
// use a sign-in help link, get rejected. One admin, several people, run in order.
test.describe.configure({ mode: "serial" });

const adminEmail = uniqueEmail("matt");
const adaEmail = uniqueEmail("ada");
const bobEmail = uniqueEmail("bob");
const password = "correct horse battery";
const newPassword = "a much better password";
let adminId = "";

test.beforeAll(async () => {
  adminId = await createAdmin(adminEmail, password);
});

test("a friend signs up with email and lands on the waiting screen", async ({ browser }) => {
  const ada = await newPerson(browser);
  await createAccountWithEmail(ada.page, "Ada", adaEmail, password);
  await expect(ada.page.getByRole("heading", { name: /in the queue, Ada/ })).toBeVisible();
  // she sees the waiting screen and nothing of the challenge itself
  await expect(ada.page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await ada.context.close();
});

test("the admin sees her waiting, approves her, and her screen turns into the challenge by itself", async ({
  browser,
}) => {
  const ada = await newPerson(browser);
  await signInWithEmail(ada.page, adaEmail, password);
  await expect(ada.page.getByRole("heading", { name: /in the queue, Ada/ })).toBeVisible();

  const matt = await newPerson(browser);
  await signInWithEmail(matt.page, adminEmail, password);
  const people = matt.page.getByRole("link", { name: /People/ });
  await expect(people).toContainText(/\d/); // a badge counts the people waiting (at least Ada)
  await people.click();
  await expect(matt.page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  const row = matt.page.getByRole("listitem").filter({ hasText: adaEmail });
  await expect(row).toContainText("Ada");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(matt.page.getByText("Ada is in.")).toBeVisible();

  // no reload, no second sign-in: her waiting screen polls and switches over
  await expect(ada.page.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 30_000 });
  await expect(ada.page.getByRole("heading", { name: /in the queue/ })).toHaveCount(0);
  await ada.context.close();
  await matt.context.close();
});

test("only the admin can open the People page", async ({ browser }) => {
  const ada = await newPerson(browser);
  await signInWithEmail(ada.page, adaEmail, password);
  await expect(ada.page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(ada.page.getByRole("link", { name: /People/ })).toHaveCount(0);
  // Next streams the page, so the HTTP status is already 200 by the time notFound() runs. What
  // matters is what she gets: the ordinary not-found page, and none of the admin content.
  await ada.page.goto("/admin");
  await expect(ada.page.getByRole("heading", { name: /that page isn.t here/i })).toBeVisible();
  await expect(ada.page.getByRole("heading", { name: "People", exact: true })).toHaveCount(0);
  await expect(ada.page.getByText(adminEmail)).toHaveCount(0);
  await ada.context.close();
});

test("signing up again with the same email does not reveal that it exists", async ({ browser }) => {
  // the right password: she probably forgot she had an account, so she is simply signed in
  const forgetful = await newPerson(browser);
  await createAccountWithEmail(forgetful.page, "Ada", adaEmail, password);
  await expect(forgetful.page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await forgetful.context.close();

  // a different password: the same neutral message, which does not say the email is registered
  const stranger = await newPerson(browser);
  await createAccountWithEmail(stranger.page, "Not Ada", adaEmail, "some other password");
  const message = notice(stranger.page);
  await expect(message).toContainText(/couldn't create that account/i);
  await expect(message).not.toContainText(/already (has|registered|exists)|is registered|in use|taken/i);
  await stranger.context.close();
});

test("a wrong password is refused with a fixed message", async ({ browser }) => {
  const person = await newPerson(browser);
  await signInWithEmail(person.page, adaEmail, "definitely not the password");
  await expect(notice(person.page)).toHaveText("Wrong email or password.");
  await person.context.close();
});

test("a friend who forgot their password gets a one-time help link and chooses a new one", async ({ browser }) => {
  const matt = await newPerson(browser);
  await signInWithEmail(matt.page, adminEmail, password);
  await expect(matt.page.getByRole("navigation", { name: "Main" })).toBeVisible(); // signed in before moving on
  await matt.page.goto("/admin");
  const row = matt.page.getByRole("listitem").filter({ hasText: adaEmail });
  await row.getByRole("button", { name: "Sign-in help link" }).click();
  const link = await matt.page.getByLabel(/Send this link to Ada privately/).inputValue();
  expect(link).toContain("/auth/confirm?token_hash=");
  expect(link).toContain("type=recovery");

  // Ada opens it: she is signed in and chooses a new password
  const ada = await newPerson(browser);
  await ada.page.goto(link);
  await expect(ada.page).toHaveURL(/\/auth\/reset$/);
  await ada.page.getByLabel("New password").fill(newPassword);
  await ada.page.getByLabel("Type it again").fill("something different");
  await ada.page.getByRole("button", { name: "Save password" }).click();
  await expect(notice(ada.page)).toHaveText("The two passwords don't match.");
  await ada.page.getByLabel("New password").fill(newPassword);
  await ada.page.getByLabel("Type it again").fill(newPassword);
  await ada.page.getByRole("button", { name: "Save password" }).click();
  await expect(ada.page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await ada.context.close();

  // the link works once
  const again = await newPerson(browser);
  await again.page.goto(link);
  await expect(again.page).toHaveURL(/\/login\?error=expired$/);
  await expect(notice(again.page)).toContainText("expired or was already used");
  await again.context.close();

  // the old password is gone and the new one works
  const back = await newPerson(browser);
  await signInWithEmail(back.page, adaEmail, password);
  await expect(notice(back.page)).toHaveText("Wrong email or password.");
  await signInWithEmail(back.page, adaEmail, newPassword);
  await expect(back.page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await back.context.close();
  await matt.context.close();
});

test("the admin can reject a sign-up, and that person can no longer sign in", async ({ browser }) => {
  const bob = await newPerson(browser);
  await createAccountWithEmail(bob.page, "Bob", bobEmail, password);
  await expect(bob.page.getByRole("heading", { name: /in the queue, Bob/ })).toBeVisible();

  const matt = await newPerson(browser);
  await signInWithEmail(matt.page, adminEmail, password);
  await expect(matt.page.getByRole("navigation", { name: "Main" })).toBeVisible(); // signed in before moving on
  await matt.page.goto("/admin");
  const row = matt.page.getByRole("listitem").filter({ hasText: bobEmail });
  await row.getByRole("button", { name: "Reject" }).click(); // the first tap only asks
  await expect(row.getByRole("button", { name: /Tap again to delete this account/ })).toBeVisible();
  await row.getByRole("button", { name: /Tap again to delete this account/ }).click();
  await expect(matt.page.getByText("Bob's sign-up was rejected.")).toBeVisible();
  await expect(matt.page.getByRole("listitem").filter({ hasText: bobEmail })).toHaveCount(0);

  const again = await newPerson(browser);
  await signInWithEmail(again.page, bobEmail, password);
  await expect(notice(again.page)).toHaveText("Wrong email or password.");
  await bob.context.close();
  await matt.context.close();
  await again.context.close();
});

test("every admin action left a trace, by id only", async () => {
  const { data, error } = await admin().from("admin_actions").select("actor, action").order("id");
  expect(error).toBeNull();
  expect((data ?? []).map((r) => r.action)).toEqual(["approve", "help_link", "reject_signup"]);
  expect((data ?? []).every((r) => r.actor === adminId)).toBe(true);
});

test("text in the URL is never shown on the sign-in page", async ({ page }) => {
  await page.goto("/login?error=<b>Your account is locked</b> call 555-0100");
  await expect(page.getByText("555-0100")).toHaveCount(0);
  await expect(notice(page)).toHaveCount(0);
  await page.goto("/login?error=expired");
  await expect(notice(page)).toContainText("expired or was already used");
});
