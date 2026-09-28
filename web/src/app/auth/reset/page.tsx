import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/data/viewer";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Where a sign-in help link from an admin ends up. It needs the session the link just started. */
export default async function ResetPasswordPage() {
  if (!(await getViewer())) redirect("/login?error=expired");
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-5 py-12">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold">Choose a new password</h1>
        <p className="text-ink-2">You’re signed in. Pick a password you’ll remember for next time.</p>
      </div>
      <div className="panel grid gap-4 p-6">
        <ResetPasswordForm />
      </div>
    </main>
  );
}
