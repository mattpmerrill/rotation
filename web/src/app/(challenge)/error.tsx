"use client";

import { Button } from "@/ui/button";

export default function ChallengeError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="grid max-w-md gap-4">
      <h1 className="text-2xl font-semibold">This page didn’t load</h1>
      <p className="text-ink-2">
        Something failed on the server. Try again; if it keeps happening, tell Matt what you were doing.
      </p>
      <Button variant="quiet" className="w-fit" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
