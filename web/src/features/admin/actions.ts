"use server";

import { revalidatePath } from "next/cache";
import { requestOrigin } from "@/data/origin";
import { requireAdmin } from "@/data/viewer";
import { firstIssue } from "@/lib/first-issue";
import { personIdInput } from "./schema";
import { approvePerson, createHelpLink, rejectPerson, removeMembership } from "./service";

/**
 * Transport for the admin use cases: confirm the caller is an admin, validate the argument, call
 * one service, report the result. Server Actions can be posted to directly, so each one checks
 * requireAdmin() itself, and the database functions check again.
 */
export interface AdminResult {
  error?: string;
}

async function run(
  personId: string,
  perform: (id: string) => Promise<{ ok: true } | { ok: false; error: { message: string } }>,
): Promise<AdminResult> {
  await requireAdmin();
  const id = personIdInput.safeParse(personId);
  if (!id.success) return { error: firstIssue(id.error) };
  const result = await perform(id.data);
  if (!result.ok) return { error: result.error.message };
  revalidatePath("/", "layout");
  return {};
}

export async function approve(personId: string): Promise<AdminResult> {
  return run(personId, approvePerson);
}

export async function removeMember(personId: string): Promise<AdminResult> {
  return run(personId, removeMembership);
}

export async function reject(personId: string): Promise<AdminResult> {
  return run(personId, rejectPerson);
}

/** A one-time sign-in help link for someone who forgot their password. */
export async function helpLink(personId: string): Promise<{ url?: string; error?: string }> {
  await requireAdmin();
  const id = personIdInput.safeParse(personId);
  if (!id.success) return { error: firstIssue(id.error) };
  const result = await createHelpLink(id.data, await requestOrigin());
  return result.ok ? { url: result.data.url } : { error: result.error.message };
}
