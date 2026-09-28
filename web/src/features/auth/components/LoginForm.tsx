"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { BitcoinSpinner } from "@/ui/BitcoinSpinner";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { signIn, signInWithGoogle, signUp, type AuthFormState } from "../actions";

export function LoginForm({ linkError }: { linkError?: string | undefined }) {
  const [signInState, signInAction, signingIn] = useActionState(signIn, {} as AuthFormState);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, {} as AuthFormState);
  const error = signInState.error ?? signUpState.error ?? linkError;
  const busy = signingIn || signingUp;

  return (
    <div className="grid gap-5">
      {error && <Notice tone="error">{error}</Notice>}
      {signUpState.sent && <Notice tone="success">Check your email for a confirmation link, then sign in.</Notice>}

      <form action={signInWithGoogle}>
        <GoogleButton />
      </form>

      <div className="text-ink-3 flex items-center gap-3 text-xs tracking-wider uppercase">
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
          hint="New here? Choose 10 or more characters and create an account."
        />
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr]">
          <Button formAction={signInAction} disabled={busy}>
            {signingIn && <BitcoinSpinner size="sm" label="Signing in" />}
            {signingIn ? "Signing in…" : "Sign in"}
          </Button>
          <Button formAction={signUpAction} variant="quiet" disabled={busy}>
            {signingUp && <BitcoinSpinner size="sm" label="Creating account" />}
            {signingUp ? "Creating…" : "Create account"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Google's own sign-in style: white, the four-colour G, dark text. */
function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[10px] border border-[#dadce0] bg-white px-4 text-[15px] font-semibold text-[#1f1f1f] shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition hover:bg-[#f7f8f8] hover:shadow-[0_4px_14px_rgb(0_0_0/0.35)] disabled:opacity-70"
    >
      {pending ? <BitcoinSpinner size="sm" label="Opening Google" /> : <GoogleG />}
      Continue with Google
    </button>
  );
}

function GoogleG() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
