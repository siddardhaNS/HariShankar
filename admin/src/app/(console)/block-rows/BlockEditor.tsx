"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { blockSeats, releaseSeats } from "@/app/actions/ops";
import { Alert } from "@/components/Brand";
import { SeatGrid, SeatLegend } from "@/components/SeatGrid";
import type { AdminSeat, AdminSeatMap } from "@/lib/types";

const REASONS = ["House quota", "Guests", "Press", "Repair", "Other"];

export function BlockEditor({ map, showId, scopeLabel }: { map: AdminSeatMap; showId: string | null; scopeLabel: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState(REASONS[0]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // Looking at one show, but blocking (or unblocking) for every upcoming show
  const [allShows, setAllShows] = useState(false);
  const wide = !showId || allShows;

  const byId = useMemo(() => new Map(map.seats.map((s) => [s.id, s])), [map]);
  const sel = [...selected].map((id) => byId.get(id)).filter((s): s is AdminSeat => !!s);
  // Unblock lifts blocks of the chosen scope: this show's own, or the all-shows ones
  // (a sold seat here may still carry an all-shows block, so it counts for an all-shows unblock)
  const releasable = sel.filter(
    (s) => (s.state === "blocked" && (showId ? s.block_all_shows === allShows : true)) || (showId && allShows && s.state === "booked"),
  );
  // For all shows, a seat sold or blocked only in this show can still be blocked for every
  // show: the buyer keeps this show's ticket, and the seat isn't sold for the others
  const blockable = sel.filter(
    (s) => s.state === "free" || (showId && allShows && (s.state === "booked" || (s.state === "blocked" && !s.block_all_shows))),
  );
  const labels = (list: AdminSeat[]) => list.map((s) => `${s.row}${s.number}`).join(", ");

  const toggle = (s: AdminSeat) => {
    setMsg(null);
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(s.id)) n.delete(s.id);
      else n.add(s.id);
      return n;
    });
  };
  const toggleRow = (row: AdminSeat[]) => {
    setMsg(null);
    const pickable = row.filter((s) => s.state !== "booked" || allShows);
    setSelected((cur) => {
      const n = new Set(cur);
      const all = pickable.every((s) => n.has(s.id));
      pickable.forEach((s) => (all ? n.delete(s.id) : n.add(s.id)));
      return n;
    });
  };

  const act = (kind: "block" | "release") =>
    start(async () => {
      const ids = (kind === "block" ? blockable : releasable).map((s) => s.id);
      const scope = wide ? null : showId;
      const res = kind === "block" ? await blockSeats(ids, scope, reason) : await releaseSeats(ids, scope);
      if (!res.ok) return setMsg({ kind: "error", text: res.error });
      const d = res.data;
      const where = wide ? " for all upcoming shows" : " for this show";
      const parts = [kind === "block" ? `${d.blocked} seat(s) blocked${where}.` : `${-d.blocked} seat(s) unblocked${where}.`];
      if (d.skipped_sold.length) parts.push(`Already sold, left as is: ${d.skipped_sold.join(", ")}.`);
      setMsg({ kind: "ok", text: parts.join(" ") });
      setSelected(new Set());
      router.refresh();
    });

  const booked = useMemo(() => {
    const g = new Map<string, { by: string; seats: string[] }>();
    for (const s of map.seats) {
      if (s.state !== "booked" || !s.booking_code) continue;
      const cur = g.get(s.booking_code) ?? { by: s.booked_by ?? "", seats: [] };
      cur.seats.push(`${s.row}${s.number}`);
      g.set(s.booking_code, cur);
    }
    return [...g.entries()];
  }, [map]);

  const counts = {
    free: map.seats.filter((s) => s.state === "free").length,
    booked: map.seats.filter((s) => s.state === "booked").length,
    blocked: map.seats.filter((s) => s.state === "blocked").length,
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{scopeLabel}</h2>
            <p className="text-xs text-muted">
              {counts.free} free · {showId ? `${counts.booked} booked · ` : ""}{counts.blocked} blocked. Tap seats, or a row letter for the whole row.
            </p>
          </div>
          <SeatLegend showBooked={!!showId} />
        </div>
        <SeatGrid seats={map.seats} classes={map.classes} selected={selected} onToggle={toggle} onRow={toggleRow} pickBooked={allShows} />
      </section>

      <div className="space-y-6">
        <section className="card h-fit p-5">
          <h2 className="font-bold">{sel.length ? `${sel.length} seat${sel.length > 1 ? "s" : ""} selected` : "Pick seats"}</h2>
          <p className="mt-1 break-words text-sm text-muted">{sel.length ? labels(sel) : "Nothing selected yet."}</p>

          <label htmlFor="reason" className="mb-1.5 mt-5 block text-sm font-medium text-ink-2">Reason</label>
          <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="field">
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>

          {showId && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft/50">
              <input
                type="checkbox"
                checked={allShows}
                onChange={(e) => {
                  setAllShows(e.target.checked);
                  setMsg(null);
                  // Sold seats can only be picked for an all-shows block
                  if (!e.target.checked) {
                    setSelected((cur) => new Set([...cur].filter((id) => byId.get(id)?.state !== "booked")));
                  }
                }}
                className="mt-0.5 size-4 accent-brand"
              />
              <span>
                <span className="block text-sm font-bold">Block for all upcoming shows</span>
                <span className="block text-xs text-muted">
                  Not just this one. Sold seats can be picked too: their buyers keep this show, and the seat isn&apos;t sold for other shows.
                </span>
              </span>
            </label>
          )}

          <div className="mt-4 grid gap-2">
            <button type="button" disabled={pending || !blockable.length} onClick={() => act("block")} className="btn-primary">
              Block {blockable.length || ""} {wide ? "for all upcoming shows" : "for this show"}
            </button>
            <button type="button" disabled={pending || !releasable.length} onClick={() => act("release")} className="btn-secondary">
              Unblock {releasable.length || ""}{showId ? (allShows ? " for all upcoming shows" : " for this show") : ""}
            </button>
            {sel.length > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-muted hover:text-ink">Clear selection</button>
            )}
          </div>
          {showId && !allShows && sel.some((s) => s.block_all_shows) && (
            <p className="mt-3 text-xs text-muted">
              Some selected seats are blocked for all upcoming shows. Tick “Block for all upcoming shows” to unblock them everywhere.
            </p>
          )}
          {msg && <div className="mt-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
        </section>

        {showId && (
          <section className="card h-fit overflow-hidden">
            <h2 className="border-b border-line px-5 py-4 font-bold">Booked seats <span className="ml-1 text-muted">{counts.booked}</span></h2>
            {booked.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No seats sold yet.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {booked.map(([code, b]) => (
                  <li key={code} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div>
                      <div className="font-medium">{b.by}</div>
                      <div className="font-mono text-xs text-muted">{code}</div>
                    </div>
                    <div className="text-right text-xs text-ink-2">{b.seats.join(", ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
