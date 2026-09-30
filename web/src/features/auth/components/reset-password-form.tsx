"use client";

import { useActionState } from "react";
import { BitcoinSpinner } from "@/ui/bitcoin-spinner";
import { Button } from "@/ui/button";
import { Field } from "@/ui/field";
import { Notice } from "@/ui/notice";
import { setNewPassword, type AuthFormState } from "../actions";

/** Choose a new password after following a sign-in help link. */
export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, {});
  return (
    <form action={action} className="grid gap-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field
        id="password"
        name="password"
        type="password"
        label="New password"
        required
        minLength={10}
        autoComplete="new-password"
        hint="At least 10 characters."
      />
      <Field
        id="confirm"
        name="confirm"
        type="password"
        label="Type it again"
        required
        minLength={10}
        autoComplete="new-password"
      />
      <Button disabled={pending}>
        {pending && <BitcoinSpinner size="sm" label="Saving" />}
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
