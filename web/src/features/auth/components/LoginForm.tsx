"use client";

import { useActionState } from "react";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { signIn, signInWithGoogle, signUp, type AuthFormState } from "../actions";

export function LoginForm({ linkError }: { linkError?: string }) {
  const [signInState, signInAction, signingIn] = useActionState(signIn, {} as AuthFormState);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, {} as AuthFormState);
  const error = signInState.error ?? signUpState.error ?? linkError;

  return (
    <div className="grid gap-5">
      {error && <Notice tone="error">{error}</Notice>}
      {signUpState.sent && <Notice tone="success">Check your email for a confirmation link, then sign in.</Notice>}

      <form action={signInWithGoogle}>
        <Button variant="quiet" className="w-full">
          Continue with Google
        </Button>
      </form>

      <div className="text-ink-3 flex items-center gap-3 text-sm">
        <span className="bg-line h-px flex-1" />
        or with email
        <span className="bg-line h-px flex-1" />
      </div>

      <form className="grid gap-4">
        <Field id="email" name="email" type="email" label="Email" required autoComplete="email" />
        <Field
          id="password"
          name="password"
          type="password"
          label="Password"
          required
          minLength={10}
          autoComplete="current-password"
          hint="New here? Choose a password of 10 or more characters and create an account."
        />
        <div className="grid grid-cols-2 gap-2">
          <Button formAction={signInAction} disabled={signingIn || signingUp}>
            Sign in
          </Button>
          <Button formAction={signUpAction} variant="quiet" disabled={signingIn || signingUp}>
            Create account
          </Button>
        </div>
      </form>
    </div>
  );
}
