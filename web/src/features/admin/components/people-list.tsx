"use client";

import { useState, useTransition } from "react";
import type { Person } from "@/domain/people";
import { formatDay } from "@/lib/format";
import { Button } from "@/ui/button";
import { Notice } from "@/ui/notice";
import { Section } from "@/ui/section";
import { TwoTapButton } from "@/ui/two-tap-button";
import { approve, helpLink, reject, removeMember } from "../actions";

/** Who is waiting for approval, and who is in. Every action reports its result inline. */
export function PeopleList({ waiting, members }: { waiting: Person[]; members: Person[] }) {
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string }>();
  const [link, setLink] = useState<{ personId: string; url: string }>();
  const [pending, start] = useTransition();

  const act = (run: () => Promise<{ error?: string }>, done: string) =>
    start(async () => {
      const r = await run();
      setMessage(r.error ? { tone: "error", text: r.error } : { tone: "success", text: done });
    });

  const makeLink = (person: Person) =>
    start(async () => {
      const r = await helpLink(person.id);
      if (r.url) {
        setLink({ personId: person.id, url: r.url });
        setMessage(undefined);
      } else setMessage({ tone: "error", text: r.error ?? "Couldn't make the link." });
    });

  return (
    <div className="grid gap-10">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Section title={`Waiting for approval${waiting.length ? ` (${waiting.length})` : ""}`}>
        {waiting.length === 0 ? (
          <Notice>
            Nobody is waiting. Send your friends the link to this app: they sign up, and they show up here.
          </Notice>
        ) : (
          <ul className="grid gap-3">
            {waiting.map((p) => (
              <li
                key={p.id}
                className="border-line bg-surface flex flex-wrap items-center gap-3 rounded-2xl border p-4"
              >
                <PersonSummary person={p} />
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <Button disabled={pending} onClick={() => act(() => approve(p.id), `${p.name} is in.`)}>
                    Approve
                  </Button>
                  <TwoTapButton
                    disabled={pending}
                    confirmLabel="Tap again to delete this account"
                    onConfirm={() => act(() => reject(p.id), `${p.name}'s sign-up was rejected.`)}
                  >
                    Reject
                  </TwoTapButton>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`In the challenge (${members.length})`}>
        <ul className="grid gap-3">
          {members.map((p) => (
            <li key={p.id} className="border-line bg-surface grid gap-3 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <PersonSummary person={p} />
                {!p.isAdmin && (
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Button variant="quiet" disabled={pending} onClick={() => makeLink(p)}>
                      Sign-in help link
                    </Button>
                    <TwoTapButton
                      disabled={pending}
                      confirmLabel="Tap again to remove from the challenge"
                      onConfirm={() => act(() => removeMember(p.id), `${p.name} was removed from the challenge.`)}
                    >
                      Remove
                    </TwoTapButton>
                  </span>
                )}
              </div>
              {link?.personId === p.id && <HelpLink url={link.url} name={p.name} />}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function PersonSummary({ person }: { person: Person }) {
  return (
    <div className="grid gap-0.5">
      <span className="font-semibold">
        {person.name}
        {person.isAdmin && (
          <span className="bg-btc/15 text-gold ring-btc/40 ml-2 rounded-full px-2 py-0.5 text-xs ring-1">Admin</span>
        )}
      </span>
      <span className="text-ink-2 text-sm">{person.email}</span>
      <span className="text-ink-3 text-xs">
        Signed up {formatDay(person.signedUpAt.slice(0, 10))} with {person.provider === "google" ? "Google" : "email"}
      </span>
    </div>
  );
}

/** The one-time link, shown once so it can be copied and sent privately. */
function HelpLink({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-line bg-bg grid gap-2 rounded-xl border p-3">
      <label htmlFor="help-link" className="text-ink-2 text-sm">
        Send this link to {name} privately. It signs them in and lets them choose a new password. It works once and
        expires within an hour.
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="help-link"
          readOnly
          value={url}
          className="field min-w-0 flex-1"
          onFocus={(e) => e.target.select()}
        />
        <Button
          variant="quiet"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
