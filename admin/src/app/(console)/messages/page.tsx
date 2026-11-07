import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Audience, AudienceSize, Campaign, Channel, MessageLog } from "@/lib/types";
import { CancelButton } from "./CancelButton";
import { Compose } from "./Compose";

export const metadata: Metadata = { title: "Messages" };

const KINDS: Record<string, string> = {
  booking_confirmed: "Booking confirmed",
  reminder_morning: "Reminder, morning",
  reminder_hour: "Reminder, 1 hour before",
  refunded: "Refund",
  refund_sent: "Refund sent",
  promotion: "Offer",
};
const AUDIENCE: Record<Audience, string> = { all: "Everyone opted in", recent_90: "Last 90 days", recent_30: "Last 30 days" };
const CHANNEL: Record<Channel, string> = { whatsapp: "WhatsApp", push: "App notification", both: "WhatsApp and app" };
const STATUS: Record<MessageLog["status"], string> = {
  sent: "bg-ok-soft text-[#145c33]",
  queued: "bg-[#fff4c2] text-[#7a5b00]",
  skipped: "bg-[#e9eaf1] text-muted",
  failed: "bg-brand-soft text-[#8a1424]",
};

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const me = await getMe();
  if (me.user.role !== "owner" && me.user.role !== "super_admin") return <Forbidden />;
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" && sp.kind in KINDS ? sp.kind : null;
  const [sizes, campaigns, log] = await Promise.all([
    api<AudienceSize[]>("/api/admin/messages/audience"),
    api<Campaign[]>("/api/admin/messages/campaigns"),
    api<MessageLog[]>(`/api/admin/messages/log${kind ? `?kind=${kind}` : ""}`),
  ]);
  const sizeMap = Object.fromEntries(sizes.map((s) => [s.audience, s])) as Record<Audience, AudienceSize>;

  return (
    <>
      <PageHeader title="Messages" subtitle="Offers on WhatsApp or as app notifications to customers who asked for them, and every message the theatre has sent" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="border-b border-line px-5 py-4"><h2 className="font-bold">Offer messages</h2></div>
            {campaigns.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">None sent yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {campaigns.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start gap-x-6 gap-y-2 px-5 py-4">
                    <div className="min-w-[220px] flex-1">
                      <div className="font-bold">{c.title}</div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted">{c.body}</p>
                      <p className="mt-1 text-xs text-muted">{CHANNEL[c.channel] ?? "WhatsApp"} · {AUDIENCE[c.audience]} · {c.status === "queued" ? `Goes ${dateTime(c.send_after)}` : `From ${dateTime(c.send_after)}`}</p>
                    </div>
                    <div className="w-44 text-sm tabular-nums">
                      <div><b>{c.sent}</b> of {c.recipients} sent</div>
                      {(c.skipped > 0 || c.failed > 0) && (
                        <div className="text-xs text-muted">{c.skipped} skipped{c.failed ? ` · ${c.failed} failed` : ""}</div>
                      )}
                    </div>
                    {c.status !== "done" && <CancelButton id={c.id} />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 className="font-bold">All messages <span className="font-normal text-muted">latest 100</span></h2>
              <div className="flex flex-wrap gap-1.5 text-sm">
                <Link href="/messages" className={`rounded-lg border px-2.5 py-1 ${!kind ? "border-ink bg-ink text-white" : "border-line"}`}>All</Link>
                {Object.entries(KINDS).map(([k, v]) => (
                  <Link key={k} href={`/messages?kind=${k}`} className={`rounded-lg border px-2.5 py-1 ${kind === k ? "border-ink bg-ink text-white" : "border-line"}`}>{v}</Link>
                ))}
              </div>
            </div>
            {log.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No messages yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {log.map((m) => (
                  <li key={m.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS[m.status]}`}>{m.status}</span>
                      <span className="font-bold">{KINDS[m.kind] ?? m.kind}</span>
                      <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-bold text-ink-2">{m.channel === "push" ? "App" : "WhatsApp"}</span>
                      <span className="text-muted">+91 {m.mobile}{m.booking_code ? ` · ${m.booking_code}` : ""}</span>
                      <span className="ml-auto text-xs text-muted">{m.sent_at ? `Sent ${dateTime(m.sent_at)}` : `Due ${dateTime(m.send_after)}`}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-muted">{m.body}</p>
                    {m.error && <p className="mt-0.5 text-xs text-muted">Why: {m.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <Compose theatreName={me.theatre?.name ?? ""} sizes={sizeMap} />
      </div>
    </>
  );
}
