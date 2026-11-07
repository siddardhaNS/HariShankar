"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { savePromotion, type PromotionInput } from "@/app/actions/ops";
import { Alert } from "@/components/Brand";
import type { Promotion } from "@/lib/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMPTY: PromotionInput = {
  code: "", title: "", kind: "per_ticket", value: 3000, max_discount_paise: null, min_tickets: 1,
  weekdays: "0123456", starts_on: null, ends_on: null, max_uses: null, per_customer: 1,
  first_booking_only: false, show_in_app: true, is_active: true,
};

const toRupees = (paise: number | null) => (paise == null ? "" : String(paise / 100));
const toPaise = (rupees: string) => (rupees.trim() === "" ? null : Math.round(Number(rupees) * 100));
const toInt = (s: string) => (s.trim() === "" ? null : Math.max(1, Math.floor(Number(s))));

export function PromotionForm({ promo }: { promo: Promotion | null }) {
  const router = useRouter();
  const [p, setP] = useState<PromotionInput>(promo ? { ...promo } : EMPTY);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const editing = promo !== null;

  const set = (patch: Partial<PromotionInput>) => {
    setMsg(null);
    setP((x) => ({ ...x, ...patch }));
  };
  const toggleDay = (d: number) => {
    const has = p.weekdays.includes(String(d));
    set({ weekdays: has ? p.weekdays.replace(String(d), "") : [...p.weekdays, String(d)].sort().join("") });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!p.weekdays) return setMsg({ kind: "error", text: "Pick at least one day" });
    start(async () => {
      const res = await savePromotion(promo?.id ?? null, {
        code: p.code.trim().toUpperCase(),
        title: p.title.trim(),
        kind: p.kind,
        value: p.value,
        max_discount_paise: p.kind === "percent" ? p.max_discount_paise : null,
        min_tickets: p.min_tickets,
        weekdays: p.weekdays,
        starts_on: p.starts_on || null,
        ends_on: p.ends_on || null,
        max_uses: p.max_uses,
        per_customer: p.per_customer,
        first_booking_only: p.first_booking_only,
        show_in_app: p.show_in_app,
        is_active: p.is_active,
      });
      if (!res.ok) return setMsg({ kind: "error", text: res.error });
      if (editing) setMsg({ kind: "ok", text: "Saved" });
      else {
        setP(EMPTY);
        setMsg({
          kind: "ok",
          text: `${res.data.code} is live. ${res.data.show_in_app ? "Customers see it at checkout." : "Share the code with customers."}`,
        });
      }
      router.refresh();
    });
  };

  const label = "mb-1.5 block text-sm font-medium text-ink-2";
  return (
    <section className="card h-fit p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{editing ? `Edit ${promo.code}` : "Add a promo code"}</h2>
        {editing && <Link href="/promotions" className="text-sm text-muted hover:text-ink">New code</Link>}
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <div>
            <label htmlFor="code" className={label}>Code</label>
            <input
              id="code" required minLength={3} maxLength={20} disabled={editing} value={p.code}
              onChange={(e) => set({ code: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() })}
              placeholder="MATINEE30" className="field font-mono uppercase tracking-wider disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="ptitle" className={label}>What customers see</label>
            <input
              id="ptitle" required minLength={3} maxLength={80} value={p.title}
              onChange={(e) => set({ title: e.target.value })} placeholder="₹30 off every matinee ticket" className="field"
            />
          </div>
        </div>

        <fieldset disabled={editing} className="disabled:opacity-60">
          <legend className={label}>Discount</legend>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Discount type" value={p.kind}
              onChange={(e) => {
                const kind = e.target.value as PromotionInput["kind"];
                set({ kind, value: kind === "percent" ? 10 : 3000 });
              }}
              className="field w-auto"
            >
              <option value="per_ticket">₹ off each ticket</option>
              <option value="percent">% off tickets</option>
            </select>
            {p.kind === "per_ticket" ? (
              <input
                aria-label="Rupees off each ticket" type="number" min={1} max={1000} required value={toRupees(p.value)}
                onChange={(e) => set({ value: toPaise(e.target.value) ?? 0 })} className="field w-24"
              />
            ) : (
              <input
                aria-label="Percent off" type="number" min={1} max={100} required value={p.value}
                onChange={(e) => set({ value: Number(e.target.value) || 0 })} className="field w-20"
              />
            )}
            <span className="text-sm text-muted">{p.kind === "per_ticket" ? "₹" : "%"}</span>
          </div>
          {editing && (
            <p className="mt-1 text-xs text-muted">
              Code and discount can&apos;t change once made. Turn this one off and add a new code instead.
            </p>
          )}
        </fieldset>
        {p.kind === "percent" && (
          <div>
            <label htmlFor="cap" className={label}>Most it can take off a booking (₹, optional)</label>
            <input
              id="cap" type="number" min={1} value={toRupees(p.max_discount_paise)}
              onChange={(e) => set({ max_discount_paise: toPaise(e.target.value) })} className="field w-32"
            />
          </div>
        )}

        <div>
          <span className={label}>Show days</span>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = p.weekdays.includes(String(i));
              return (
                <button
                  key={d} type="button" onClick={() => toggleDay(i)} aria-pressed={on}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium ${on ? "border-ink bg-ink text-white" : "border-line text-muted"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="from" className={label}>Shows from</label>
            <input id="from" type="date" value={p.starts_on ?? ""} onChange={(e) => set({ starts_on: e.target.value || null })} className="field" />
          </div>
          <div>
            <label htmlFor="until" className={label}>Shows until</label>
            <input id="until" type="date" value={p.ends_on ?? ""} onChange={(e) => set({ ends_on: e.target.value || null })} className="field" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="min" className={label}>Min. tickets</label>
            <input id="min" type="number" min={1} max={10} value={p.min_tickets} onChange={(e) => set({ min_tickets: toInt(e.target.value) ?? 1 })} className="field" />
          </div>
          <div>
            <label htmlFor="per" className={label}>Per customer</label>
            <input id="per" type="number" min={1} placeholder="Any" value={p.per_customer ?? ""} onChange={(e) => set({ per_customer: toInt(e.target.value) })} className="field" />
          </div>
          <div>
            <label htmlFor="max" className={label}>Total uses</label>
            <input id="max" type="number" min={1} placeholder="No limit" value={p.max_uses ?? ""} onChange={(e) => set({ max_uses: toInt(e.target.value) })} className="field" />
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.show_in_app} onChange={(e) => set({ show_in_app: e.target.checked })} className="size-4 accent-brand" />
            List it in the app at checkout (off: only people who know the code)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.first_booking_only} onChange={(e) => set({ first_booking_only: e.target.checked })} className="size-4 accent-brand" />
            Only for a customer&apos;s first booking
          </label>
        </div>
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Saving…" : editing ? "Save changes" : "Add promo code"}
        </button>
      </form>
    </section>
  );
}
