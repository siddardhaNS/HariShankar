"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createShows } from "@/app/actions/ops";
import { Alert } from "@/components/Brand";
import { addDays, dayLong } from "@/lib/format";
import type { Movie } from "@/lib/types";

const PRESET_TIMES = ["11:00", "14:30", "18:30", "21:30"];
const DEFAULT_PRICES: Record<string, number> = { "Second class": 80, "First class": 150, Balcony: 200 };

function label12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

type Props = { movies: Movie[]; classes: { id: string; name: string }[]; today: string };

export function AddShows({ movies, classes, today }: Props) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const [movieId, setMovieId] = useState(movies[0]?.id ?? "");
  const [dates, setDates] = useState<Set<string>>(new Set(days.slice(0, 7)));
  const [times, setTimes] = useState<string[]>(PRESET_TIMES);
  const [customTime, setCustomTime] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(classes.map((c) => [c.id, String(DEFAULT_PRICES[c.name] ?? 100)])),
  );
  const [intervalMin, setIntervalMin] = useState(15);
  const [opensMode, setOpensMode] = useState<"now" | "later">("now");
  const [opensAt, setOpensAt] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string; skipped?: string[] } | null>(null);

  if (!classes.length || !movies.length) {
    return (
      <section className="card h-fit p-5">
        <h2 className="font-bold">Set up shows</h2>
        <p className="mt-2 text-sm text-muted">
          {!classes.length ? (
            <>First set up the <Link href="/shows/layout" className="text-brand underline">hall layout</Link>.</>
          ) : (
            <>First <Link href="/shows/movies" className="text-brand underline">add a movie</Link>.</>
          )}
        </p>
      </section>
    );
  }

  const toggleDate = (d: string) =>
    setDates((s) => {
      const n = new Set(s);
      if (n.has(d)) n.delete(d);
      else n.add(d);
      return n;
    });
  const toggleTime = (t: string) => setTimes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t].sort()));

  const count = dates.size * times.length;

  const submit = () => {
    setResult(null);
    const paise: Record<string, number> = {};
    for (const c of classes) {
      const v = Number(prices[c.id]);
      if (!Number.isFinite(v) || v < 0) return setResult({ kind: "error", text: `Enter a price for ${c.name}` });
      paise[c.id] = Math.round(v * 100);
    }
    if (opensMode === "later" && !opensAt) return setResult({ kind: "error", text: "Pick when booking opens" });
    start(async () => {
      const res = await createShows({
        movie_id: movieId,
        dates: [...dates].sort(),
        times,
        prices: paise,
        interval_min: intervalMin,
        booking_opens_at: opensMode === "later" ? new Date(`${opensAt}:00+05:30`).toISOString() : null,
      });
      if (!res.ok) return setResult({ kind: "error", text: res.error });
      const { created, skipped } = res.data;
      setResult({
        kind: created ? "ok" : "error",
        text: created ? `${created} show${created === 1 ? "" : "s"} added.` : "No shows added.",
        skipped: skipped.map((s) => `${dayLong(s.date)} ${label12(s.time)}: ${s.reason}`),
      });
    });
  };

  const label = "mb-2 block text-sm font-medium text-ink-2";
  const chip = (on: boolean) =>
    `rounded-lg border px-2.5 py-1.5 text-sm transition ${on ? "border-brand bg-brand-soft font-bold text-[#8a1424]" : "border-line bg-white text-ink-2 hover:border-[#c9ccdc]"}`;

  return (
    <section className="card h-fit p-5">
      <h2 className="font-bold">Set up shows</h2>
      <p className="mt-1 text-sm text-muted">Every day you pick gets every time you pick. Clashes are skipped.</p>
      <div className="mt-5 space-y-5">
        <div>
          <label htmlFor="movie" className={label}>Movie</label>
          <select id="movie" value={movieId} onChange={(e) => setMovieId(e.target.value)} className="field">
            {movies.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.language})</option>)}
          </select>
        </div>

        <fieldset>
          <legend className={label}>Days</legend>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const [dow, day] = dayLong(d).split(" ");
              return (
                <button key={d} type="button" onClick={() => toggleDate(d)} aria-pressed={dates.has(d)}
                  className={`${chip(dates.has(d))} flex flex-col items-center px-1 py-1`}>
                  <span className="text-[10px] uppercase">{dow.replace(",", "")}</span>
                  <span>{day}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className={label}>Show times</legend>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...PRESET_TIMES, ...times])].sort().map((t) => (
              <button key={t} type="button" onClick={() => toggleTime(t)} aria-pressed={times.includes(t)} className={chip(times.includes(t))}>
                {label12(t)}
              </button>
            ))}
            <span className="flex items-center gap-1">
              <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} aria-label="Another time"
                className="rounded-lg border border-line px-2 py-1 text-sm" />
              <button type="button" disabled={!customTime} onClick={() => { if (!times.includes(customTime)) toggleTime(customTime); setCustomTime(""); }}
                className="rounded-lg px-2 py-1 text-sm font-bold text-brand disabled:opacity-40">Add</button>
            </span>
          </div>
        </fieldset>

        <fieldset>
          <legend className={label}>Ticket price</legend>
          <div className="space-y-2">
            {classes.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm">{c.name}</span>
                <span className="text-sm text-muted">₹</span>
                <input type="number" min={0} step="1" value={prices[c.id] ?? ""} aria-label={`${c.name} price`}
                  onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value }))} className="field w-28 px-2 py-1.5" />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="interval" className={label}>Interval</label>
            <select id="interval" value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} className="field">
              {[0, 10, 15, 20].map((m) => <option key={m} value={m}>{m ? `${m} min` : "None"}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="opens" className={label}>Online booking opens</label>
            <select id="opens" value={opensMode} onChange={(e) => setOpensMode(e.target.value as "now" | "later")} className="field">
              <option value="now">Right away</option>
              <option value="later">At a set time</option>
            </select>
          </div>
        </div>
        {opensMode === "later" && (
          <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} aria-label="Booking opens at" className="field" />
        )}

        {result && (
          <Alert kind={result.kind}>
            {result.text}
            {result.skipped?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {result.skipped.map((s) => <li key={s}>{s}</li>)}
              </ul>
            ) : null}
          </Alert>
        )}

        <button type="button" onClick={submit} disabled={pending || !count || !movieId} className="btn-primary w-full">
          {pending ? "Adding…" : `Add ${count} show${count === 1 ? "" : "s"}`}
        </button>
      </div>
    </section>
  );
}
