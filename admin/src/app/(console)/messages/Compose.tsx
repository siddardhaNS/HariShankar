"use client";

import { useState, useTransition } from "react";
import { sendCampaign } from "@/app/actions/ops";
import { Alert } from "@/components/Brand";
import type { Audience } from "@/lib/types";

const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: "all", label: "Everyone who turned on offers", hint: "Has booked here at least once" },
  { key: "recent_90", label: "Booked in the last 90 days", hint: "Regulars" },
  { key: "recent_30", label: "Booked in the last 30 days", hint: "Most recent" },
];
const MAX = 700;

export function Compose({ theatreName, sizes }: { theatreName: string; sizes: Record<Audience, number> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const count = sizes[audience];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (when === "later" && !at) return setMsg({ kind: "error", text: "Pick the date and time to send" });
    start(async () => {
      // datetime-local has no zone; the theatre is in India
      const send_after = when === "later" ? new Date(`${at}:00+05:30`).toISOString() : null;
      const res = await sendCampaign({ title: title.trim(), body: body.trim(), audience, send_after });
      if (!res.ok) return setMsg({ kind: "error", text: res.error });
      setTitle("");
      setBody("");
      setMsg({
        kind: "ok",
        text: `Queued for ${res.data.recipients} customer${res.data.recipients === 1 ? "" : "s"}. Messages between 9 PM and 9 AM wait until morning, and nobody gets more than 2 offers a week.`,
      });
    });
  };

  const label = "mb-1.5 block text-sm font-medium text-ink-2";
  return (
    <section className="card h-fit p-5">
      <h2 className="font-bold">New offer message</h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <div>
          <label htmlFor="ctitle" className={label}>Name (only you see this)</label>
          <input id="ctitle" required minLength={3} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Diwali matinee offer" className="field" />
        </div>
        <div>
          <label htmlFor="cbody" className={label}>Message</label>
          <textarea id="cbody" required minLength={10} maxLength={MAX} rows={5} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={"Godavari Express matinee, ₹30 off every ticket this week. Use code MATINEE30 in the app."} className="field" />
          <p className="mt-1 text-right text-xs text-muted">{body.length} / {MAX}</p>
        </div>
        <fieldset>
          <legend className={label}>Send to</legend>
          <div className="space-y-1.5">
            {AUDIENCES.map((a) => (
              <label key={a.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${audience === a.key ? "border-ink" : "border-line"}`}>
                <input type="radio" name="aud" checked={audience === a.key} onChange={() => setAudience(a.key)} className="accent-brand" />
                <span className="flex-1">{a.label}<span className="block text-xs text-muted">{a.hint}</span></span>
                <span className="font-bold tabular-nums">{sizes[a.key]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className={label}>When</legend>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} className="accent-brand" /> Now</label>
            <label className="flex items-center gap-2"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} className="accent-brand" /> Later</label>
            {when === "later" && (
              <input type="datetime-local" aria-label="Send at" value={at} onChange={(e) => setAt(e.target.value)} className="field h-9 w-auto py-1" />
            )}
          </div>
        </fieldset>

        {body.trim() && (
          <div className="rounded-xl bg-[#e7ded3] p-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5b5146]">Preview</p>
            <div className="max-w-[92%] whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm">
              {body.trim()}
              {"\n\n"}— {theatreName}
              {"\n"}To stop offers, turn off “Offers and new releases” in the app’s Profile.
            </div>
          </div>
        )}

        <button type="submit" disabled={pending || count === 0} className="btn-primary w-full">
          {pending ? "Queuing…" : count === 0 ? "Nobody in this group yet" : `Send to ${count} customer${count === 1 ? "" : "s"}`}
        </button>
        <p className="text-xs text-muted">
          Only customers who turned on “Offers and new releases” in the app get these. Booking messages and show reminders go automatically and don&apos;t need this page.
        </p>
      </form>
    </section>
  );
}
