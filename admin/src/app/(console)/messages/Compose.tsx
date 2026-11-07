"use client";

import { useState, useTransition } from "react";
import { sendCampaign } from "@/app/actions/ops";
import { Alert } from "@/components/Brand";
import type { Audience, AudienceSize, Channel } from "@/lib/types";

const AUDIENCES: { key: Audience; label: string; hint: string }[] = [
  { key: "all", label: "Everyone who turned on offers", hint: "Has booked here at least once" },
  { key: "recent_90", label: "Booked in the last 90 days", hint: "Regulars" },
  { key: "recent_30", label: "Booked in the last 30 days", hint: "Most recent" },
];
const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: "whatsapp", label: "WhatsApp", hint: "About ₹0.86 a message plus the provider's fee" },
  { key: "push", label: "App notification", hint: "Free. Only phones with the app and notifications allowed" },
  { key: "both", label: "Both", hint: "WhatsApp to everyone, and a notification to those with the app" },
];
const MAX = 700;

/** How many customers a choice reaches: everyone opted in, or only those with the app. */
function reach(size: AudienceSize | undefined, channel: Channel) {
  if (!size) return 0;
  return channel === "push" ? size.with_app : size.customers;
}

export function Compose({ theatreName, sizes }: { theatreName: string; sizes: Record<Audience, AudienceSize> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const count = reach(sizes[audience], channel);
  const showWhatsApp = channel !== "push";
  const showPush = channel !== "whatsapp";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (when === "later" && !at) return setMsg({ kind: "error", text: "Pick the date and time to send" });
    start(async () => {
      // datetime-local has no zone; the theatre is in India
      const send_after = when === "later" ? new Date(`${at}:00+05:30`).toISOString() : null;
      const res = await sendCampaign({ title: title.trim(), body: body.trim(), audience, channel, send_after });
      if (!res.ok) return setMsg({ kind: "error", text: res.error });
      setTitle("");
      setBody("");
      setMsg({
        kind: "ok",
        text: `Queued for ${res.data.recipients} customer${res.data.recipients === 1 ? "" : "s"}. Messages between 9 PM and 9 AM wait until morning, and nobody gets more than 2 offers a week on each channel.`,
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
          <legend className={label}>Send as</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {CHANNELS.map((c) => (
              <label key={c.key} title={c.hint} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 py-2 text-center text-sm font-medium ${channel === c.key ? "border-ink bg-ink text-white" : "border-line"}`}>
                <input type="radio" name="chan" checked={channel === c.key} onChange={() => setChannel(c.key)} className="sr-only" />
                {c.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{CHANNELS.find((c) => c.key === channel)?.hint}</p>
        </fieldset>
        <fieldset>
          <legend className={label}>Send to</legend>
          <div className="space-y-1.5">
            {AUDIENCES.map((a) => (
              <label key={a.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${audience === a.key ? "border-ink" : "border-line"}`}>
                <input type="radio" name="aud" checked={audience === a.key} onChange={() => setAudience(a.key)} className="accent-brand" />
                <span className="flex-1">{a.label}<span className="block text-xs text-muted">{a.hint}</span></span>
                <span className="text-right">
                  <span className="block font-bold tabular-nums">{reach(sizes[a.key], channel)}</span>
                  {channel === "both" && <span className="block text-[11px] text-muted">{sizes[a.key]?.with_app ?? 0} with app</span>}
                </span>
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

        {body.trim() && showWhatsApp && (
          <div className="rounded-xl bg-[#e7ded3] p-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5b5146]">WhatsApp preview</p>
            <div className="max-w-[92%] whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm">
              {body.trim()}
              {"\n\n"}— {theatreName}
              {"\n"}To stop offers, turn off “Offers and new releases” in the app’s Profile.
            </div>
          </div>
        )}
        {body.trim() && showPush && (
          <div className="rounded-xl bg-navy p-3">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">App notification preview</p>
            <div className="flex gap-3 rounded-2xl bg-white/95 px-3 py-2.5 text-sm shadow-sm">
              <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-xs font-bold text-white">HS</span>
              <div className="min-w-0">
                <div className="flex justify-between gap-2"><b className="truncate">{theatreName}</b><span className="text-xs text-muted">now</span></div>
                <p className="line-clamp-3 text-ink-2">{body.trim()}</p>
              </div>
            </div>
          </div>
        )}

        <button type="submit" disabled={pending || count === 0} className="btn-primary w-full">
          {pending ? "Queuing…" : count === 0 ? "Nobody in this group yet" : `Send to ${count} customer${count === 1 ? "" : "s"}`}
        </button>
        <p className="text-xs text-muted">
          Only customers who turned on “Offers and new releases” in the app get these. Booking messages and show reminders go automatically, on WhatsApp and as app notifications, and don&apos;t need this page.
        </p>
      </form>
    </section>
  );
}
