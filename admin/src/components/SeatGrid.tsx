"use client";

import type { AdminSeat } from "@/lib/types";

type Props = {
  seats: AdminSeat[];
  classes: { id: string; name: string }[];
  selected?: Set<string>;
  onToggle?: (seat: AdminSeat) => void;
  onRow?: (seats: AdminSeat[]) => void;
  /** Booked seats can be tapped too (to see who booked them). */
  pickBooked?: boolean;
};

/** The hall as a grid: empty columns are aisles, empty rows separate classes. Screen at the top. */
export function SeatGrid({ seats, classes, selected, onToggle, onRow, pickBooked }: Props) {
  if (!seats.length) {
    return <p className="py-10 text-center text-sm text-muted">No seats yet. Set up the hall layout first.</p>;
  }
  const minC = Math.min(...seats.map((s) => s.c));
  const maxC = Math.max(...seats.map((s) => s.c));
  const rows = new Map<number, AdminSeat[]>();
  for (const s of seats) rows.set(s.r, [...(rows.get(s.r) ?? []), s]);
  const className = new Map(classes.map((c) => [c.id, c.name]));
  // Each row, sorted, with a class heading wherever the class changes
  const rowList = [...rows.keys()]
    .sort((a, b) => a - b)
    .map((r) => [...rows.get(r)!].sort((a, b) => a.c - b.c))
    .map((rowSeats, i, all) => {
      const header = i === 0 || all[i - 1][0].class_id !== rowSeats[0].class_id;
      // An empty grid row inside a class is a walkway
      const gap = !header && rowSeats[0].r - all[i - 1][0].r > 1;
      return { rowSeats, header, gap };
    });

  return (
    <div className="overflow-x-auto pb-2">
      <div className="mx-auto w-max">
        <div className="mx-8 mb-1 h-3 rounded-[50%/100%_100%_0_0] border-t-4 border-brand" />
        <p className="mb-4 text-center text-[11px] font-bold tracking-[0.2em] text-muted">SCREEN</p>
        {rowList.map(({ rowSeats, header, gap }) => {
          const byCol = new Map(rowSeats.map((s) => [s.c, s]));
          const cls = rowSeats[0].class_id;
          return (
            <div key={rowSeats[0].r}>
              {header && (
                <p className="mb-2 mt-4 text-center text-[11px] font-bold uppercase tracking-[0.15em] text-muted">
                  {className.get(cls)}
                </p>
              )}
              {gap && <div className="h-5" aria-hidden />}
              <div className="flex items-center gap-1 py-[2px]">
                <button
                  type="button"
                  disabled={!onRow}
                  onClick={() => onRow?.(rowSeats)}
                  title={onRow ? `Select row ${rowSeats[0].row}` : undefined}
                  className="w-7 rounded text-center text-xs font-bold text-muted enabled:hover:bg-canvas enabled:hover:text-ink"
                >
                  {rowSeats[0].row}
                </button>
                {Array.from({ length: maxC - minC + 1 }, (_, i) => {
                  const s = byCol.get(minC + i);
                  if (!s) return <span key={i} className="h-7 w-7" />;
                  const sel = selected?.has(s.id);
                  const title =
                    s.state === "none"
                      ? `${s.row}${s.number} · No seat here${onToggle ? ". Click to put it back" : ""}`
                      : s.state === "booked"
                      ? `${s.row}${s.number} · ${s.booking_code} · ${s.booked_by}`
                      : s.state === "blocked"
                        ? `${s.row}${s.number} · Blocked: ${s.block_reason}${s.block_all_shows ? " (all upcoming shows)" : ""}`
                        : `${s.row}${s.number}`;
                  const style =
                    s.state === "none"
                      ? "border-dashed border-[#d8dae6] bg-transparent text-[#c9ccdc]"
                      : s.state === "booked"
                      ? sel
                        ? "bg-brand border-brand text-white"
                        : "bg-[#c9ccdc] border-[#c9ccdc] text-white"
                      : s.state === "blocked"
                        ? s.block_all_shows
                          ? "bg-ink border-ink text-white"
                          : "bg-[#f5b301] border-[#f5b301] text-ink"
                        : "bg-white border-[#c9ccdc] text-muted";
                  return (
                    <button
                      key={i}
                      type="button"
                      title={title}
                      aria-label={title}
                      aria-pressed={sel}
                      disabled={!onToggle || (s.state === "booked" && !pickBooked)}
                      onClick={() => onToggle?.(s)}
                      className={`h-7 w-7 rounded-t-lg rounded-b-md border-2 text-[10px] font-medium transition ${style} ${
                        sel ? "ring-2 ring-brand ring-offset-1" : ""
                      } enabled:hover:border-brand disabled:cursor-default`}
                    >
                      {s.number}
                    </button>
                  );
                })}
                <span className="w-7 text-center text-xs font-bold text-muted">{rowSeats[0].row}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SeatLegend({ showBooked = true }: { showBooked?: boolean }) {
  const item = (label: string, cls: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`h-4 w-4 rounded-t-md rounded-b-sm border-2 ${cls}`} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
      {item("Free", "bg-white border-[#c9ccdc]")}
      {showBooked && item("Booked", "bg-[#c9ccdc] border-[#c9ccdc]")}
      {item("Blocked for this show", "bg-[#f5b301] border-[#f5b301]")}
      {item("Blocked for all upcoming shows", "bg-ink border-ink")}
    </div>
  );
}
