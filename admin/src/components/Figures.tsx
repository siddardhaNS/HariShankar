import Link from "next/link";
import { addDays, dayLong, istDate } from "@/lib/format";
import type { Bar } from "@/lib/types";

/** Date range for Reports and Insights: quick picks plus a custom from/to form (plain GET, so the URL can be shared). */
export function RangePicker({ path, start, end, note }: { path: string; start: string; end: string; note?: string }) {
  const today = istDate();
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const presets = [
    { label: "Today", start: today, end: today },
    { label: "Last 7 days", start: addDays(today, -6), end: today },
    { label: "This month", start: monthStart, end: today },
    { label: "Last month", start: `${lastMonthEnd.slice(0, 8)}01`, end: lastMonthEnd },
    { label: "Last 30 days", start: addDays(today, -29), end: today },
  ];
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const on = p.start === start && p.end === end;
          return (
            <Link
              key={p.label}
              href={`${path}?start=${p.start}&end=${p.end}`}
              aria-current={on ? "true" : undefined}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-ink-2"}`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
      <form action={path} className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-ink-2">
          From
          <input type="date" name="start" defaultValue={start} max={today} className="field mt-1 h-9 w-40 py-1" />
        </label>
        <label className="text-xs font-medium text-ink-2">
          To
          <input type="date" name="end" defaultValue={end} max={today} className="field mt-1 h-9 w-40 py-1" />
        </label>
        <button type="submit" className="btn-secondary h-9 px-3 py-1 text-sm">Show</button>
      </form>
      <p className="w-full text-sm text-muted">
        {note ?? `Shows from ${dayLong(start)} to ${dayLong(end)}. Grouped by the day of the show.`}
      </p>
    </div>
  );
}

export type Tile = { label: string; value: string; hint?: string };

export function Tiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="card p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-2">{t.label}</div>
          <div className="mt-2 text-[28px] font-bold leading-none">{t.value}</div>
          {t.hint && <div className="mt-2 text-xs text-muted">{t.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * One measure as horizontal bars in a single hue. Every value is printed, so
 * the list doubles as its own table; hovering a row shows the detail note.
 */
export function BarList({ title, bars, unit = "", caption }: { title: string; bars: Bar[]; unit?: string; caption?: string }) {
  const max = Math.max(...bars.map((b) => b.value), unit === "%" ? 100 : 1);
  const empty = bars.every((b) => b.value === 0);
  return (
    <section className="card p-5">
      <h2 className="font-bold">{title}</h2>
      {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
      {empty ? (
        <p className="mt-4 text-sm text-muted">No bookings in these dates yet.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {bars.map((b) => (
            <li key={b.label} className="group relative grid grid-cols-[120px_1fr_52px] items-center gap-3 text-sm">
              <span className="truncate text-ink-2">{b.label}</span>
              <span className="h-3 rounded-r-[4px] bg-line/60" aria-hidden>
                <span
                  className="block h-full rounded-r-[4px] bg-navy transition-[width]"
                  style={{ width: `${b.value > 0 ? Math.max((b.value / max) * 100, 1.5) : 0}%` }}
                />
              </span>
              <span className="text-right font-bold tabular-nums">{b.value}{unit}</span>
              {b.note && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute -top-8 left-[132px] z-10 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow group-hover:block"
                >
                  {b.label}: {b.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
