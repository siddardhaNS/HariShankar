"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SeatGrid, SeatLegend } from "@/components/SeatGrid";
import { dateTime, isPast, pct, rupees } from "@/lib/format";
import type { AdminSeat, AdminSeatMap, SeatMapBooking, Show } from "@/lib/types";

/** Seat map of one show: tap a booked seat to see the booking; the list beside it can be searched. */
export function BookedSeats({ show, map }: { show: Show; map: AdminSeatMap }) {
  const [picked, setPicked] = useState<string | null>(null); // booking id
  const [q, setQ] = useState("");

  const selected = useMemo(
    () => new Set(map.seats.filter((s) => picked && s.booking_id === picked).map((s) => s.id)),
    [map, picked],
  );
  const pick = (s: AdminSeat) => setPicked(s.booking_id && s.booking_id !== picked ? s.booking_id : null);

  const counts = {
    booked: map.seats.filter((s) => s.state === "booked").length,
    blocked: map.seats.filter((s) => s.state === "blocked").length,
    free: map.seats.filter((s) => s.state === "free").length,
    entered: map.bookings.reduce((a, b) => a + b.seats_admitted, 0),
  };
  const needle = q.trim().toLowerCase();
  const list = needle
    ? map.bookings.filter(
        (b) =>
          b.name.toLowerCase().includes(needle) ||
          b.code.toLowerCase().includes(needle) ||
          b.mobile.includes(needle) ||
          b.seats.some((x) => x.toLowerCase() === needle),
      )
    : map.bookings;
  const current = map.bookings.find((b) => b.id === picked);
  const cancelled = show.status === "cancelled";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{show.movie_title} · {dateTime(show.starts_at)}</h2>
            <p className="text-xs text-muted">
              {cancelled
                ? `Cancelled: ${show.cancel_reason}. Every booking was refunded.`
                : `${counts.booked} booked (${pct(counts.booked, map.seats.length)}%) · ${counts.entered} entered · ${counts.blocked} blocked · ${counts.free} free. Tap a booked seat to see who booked it.`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/bookings?show=${show.id}`} className="btn-secondary px-3 py-1.5 text-sm">Bookings</Link>
            {!cancelled && !isPast(show.ends_at) && (
              <Link href={`/block-rows?show=${show.id}`} className="btn-secondary px-3 py-1.5 text-sm">Block seats</Link>
            )}
          </div>
        </div>
        <div className="mb-4"><SeatLegend /></div>
        <SeatGrid seats={map.seats} classes={map.classes} selected={selected} onToggle={pick} pickBooked />
      </section>

      <div className="space-y-6">
        {current && <BookingCard b={current} onClose={() => setPicked(null)} />}

        <section className="card h-fit overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">Booked by <span className="ml-1 text-muted">{map.bookings.length}</span></h2>
            {map.bookings.length > 0 && (
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, mobile, booking ID or seat"
                aria-label="Search bookings for this show"
                className="field mt-3 py-2 text-sm"
              />
            )}
          </div>
          {list.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">{map.bookings.length ? "No booking matches." : "No seats sold for this show."}</p>
          ) : (
            <ul className="max-h-[520px] divide-y divide-line overflow-y-auto">
              {list.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(b.id === picked ? null : b.id)}
                    aria-pressed={b.id === picked}
                    className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-sm hover:bg-canvas ${
                      b.id === picked ? "bg-brand-soft" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{b.name || b.mobile}</div>
                      <div className="font-mono text-xs text-muted">{b.code} · {b.mobile}</div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <div className="text-ink-2">{b.seats.join(", ")}</div>
                      <Entered b={b} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Entered({ b }: { b: SeatMapBooking }) {
  const n = b.seats.length;
  if (b.seats_admitted === 0) return <div className="text-muted">Not in yet</div>;
  if (b.seats_admitted >= n) return <div className="font-bold text-ok">All {n} in</div>;
  return <div className="font-bold text-[#a86f00]">{b.seats_admitted} of {n} in</div>;
}

function BookingCard({ b, onClose }: { b: SeatMapBooking; onClose: () => void }) {
  return (
    <section className="card h-fit p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Booking {b.code}</p>
          <h2 className="mt-1 text-lg font-bold">{b.name || "No name given"}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border border-line px-2.5 py-1 text-muted hover:text-ink">×</button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Mobile</dt><dd><a href={`tel:+91${b.mobile}`} className="font-medium hover:text-brand">{b.mobile}</a></dd>
        <dt className="text-muted">Seats</dt><dd className="font-medium">{b.seats.join(", ")}</dd>
        <dt className="text-muted">At the gate</dt><dd><Entered b={b} /></dd>
        <dt className="text-muted">Paid</dt><dd className="font-medium">{rupees(b.total_paise)}</dd>
        <dt className="text-muted">Booked</dt><dd>{dateTime(b.booked_at)}</dd>
      </dl>
      <Link href={`/bookings?q=${b.code}`} className="btn-secondary mt-4 w-full py-2 text-sm">Open booking</Link>
      <p className="mt-2 text-center text-xs text-muted">Resend the ticket or refund from the booking.</p>
    </section>
  );
}
