import { signIn, signInWithGoogle, signUp } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams;
  return (
    <section className="mx-auto grid w-full max-w-sm gap-5">
      <div className="grid gap-1">
        <h1 className="text-3xl font-bold">Sign in</h1>
        <p className="text-sm text-ink-2">Your plan and stack are private to you.</p>
      </div>

      {error && <p role="alert" className="card border-bad/50 p-3 text-sm text-bad">{error === "link" ? "That sign-in link has expired or was already used. Sign in again." : error}</p>}
      {sent && <p role="status" className="card border-good/50 p-3 text-sm">Check your email for a confirmation link, then come back and sign in.</p>}

      <form action={signInWithGoogle}>
        <button className="btn btn-quiet w-full">Continue with Google</button>
      </form>

      <div className="flex items-center gap-3 text-xs text-ink-3"><span className="h-px flex-1 bg-rule" />or with email<span className="h-px flex-1 bg-rule" /></div>

      <form className="grid gap-3">
        <label className="grid gap-1 text-sm">Email
          <input id="email" name="email" type="email" required autoComplete="email" className="field" />
        </label>
        <label className="grid gap-1 text-sm">Password
          <input id="password" name="password" type="password" required minLength={10} autoComplete="current-password" className="field" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button formAction={signIn} className="btn btn-primary">Sign in</button>
          <button formAction={signUp} className="btn btn-quiet">Create account</button>
        </div>
        <p className="text-xs text-ink-3">New here? Enter an email and a password of 10+ characters, then Create account.</p>
      </form>
    </section>
  );
}
