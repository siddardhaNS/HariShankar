"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { saveLayout } from "@/app/actions/ops";
import { Alert } from "@/components/Brand";
import { SeatGrid } from "@/components/SeatGrid";
import type { AdminSeat, Layout, LayoutRow } from "@/lib/types";

const DEFAULT_CLASSES = ["Second class", "First class", "Balcony"];

function nextLabel(rows: LayoutRow[]) {
  const used = new Set(rows.map((r) => r.label));
  for (const ch of "ABCDEFGHJKLMNPQRSTUVWXYZ") if (!used.has(ch)) return ch;
  return "AA";
}

/** Turn the row list into grid seats for the preview (same rules as the server). */
function previewSeats(rows: LayoutRow[]): { seats: AdminSeat[]; classes: { id: string; name: string }[] } {
  const seats: AdminSeat[] = [];
  const classes: { id: string; name: string }[] = [];
  let r = 1;
  let prev: string | null = null;
  for (const row of rows) {
    const name = row.class_name.trim() || "Unnamed";
    if (!classes.some((c) => c.id === name)) classes.push({ id: name, name });
    if (prev !== null && name !== prev) r += 1;
    prev = name;
    let c = row.indent + 1;
    for (let n = 1; n <= row.seats; n++) {
      seats.push({
        id: `${row.label}${n}`, row: row.label, number: n, r, c, class_id: name,
        state: row.missing?.includes(n) ? "none" : "free",
        block_id: null, block_reason: null, block_all_shows: false, booking_code: null, booked_by: null, booking_id: null,
      });
      c += row.aisles_after.includes(n) ? 2 : 1;
    }
    r += row.gap_after ? 2 : 1;
  }
  return { seats, classes };
}

export function LayoutEditor({ initial }: { initial: Layout }) {
  const [rows, setRows] = useState<LayoutRow[]>(initial.rows);
  const [aisleText, setAisleText] = useState<string[]>(initial.rows.map((r) => r.aisles_after.join(", ")));
  const [missingText, setMissingText] = useState<string[]>(initial.rows.map((r) => (r.missing ?? []).join(", ")));
  const [saved, setSaved] = useState<LayoutRow[]>(initial.rows);
  const [notes, setNotes] = useState<Record<string, string>>(initial.class_notes ?? {});
  const [savedNotes, setSavedNotes] = useState<Record<string, string>>(initial.class_notes ?? {});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const preview = useMemo(() => previewSeats(rows), [rows]);
  const seatCount = preview.seats.filter((s) => s.state !== "none").length;
  const classOptions = [...new Set([...DEFAULT_CLASSES, ...rows.map((r) => r.class_name)])];

  // Seats per class, front to back, for the summary and the class headings
  const classTotals = useMemo(() => {
    const out = new Map<string, { rows: number; seats: number }>();
    for (const r of rows) {
      const name = r.class_name.trim() || "Unnamed";
      const t = out.get(name) ?? { rows: 0, seats: 0 };
      out.set(name, { rows: t.rows + 1, seats: t.seats + r.seats - (r.missing?.length ?? 0) });
    }
    return out;
  }, [rows]);
  const noteOf = (name: string) => (notes[name] ?? "").trim();
  const notesDirty = [...classTotals.keys()].some((n) => noteOf(n) !== (savedNotes[n] ?? "").trim());
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved) || notesDirty;

  // The row being pointed at or edited lights up in the preview
  const activeLabel = active !== null ? rows[active]?.label : undefined;
  const highlighted = useMemo(
    () => new Set(activeLabel ? preview.seats.filter((s) => s.row === activeLabel).map((s) => s.id) : []),
    [activeLabel, preview.seats],
  );

  const discard = () => {
    setMsg(null);
    setRows(saved);
    setAisleText(saved.map((r) => r.aisles_after.join(", ")));
    setMissingText(saved.map((r) => (r.missing ?? []).join(", ")));
    setNotes(savedNotes);
  };

  const update = (i: number, patch: Partial<LayoutRow>) => {
    setMsg(null);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  /** Seat numbers typed as "4, 9" -> [4, 9], keeping only numbers in the row. */
  const parseNums = (text: string, max: number) =>
    [...new Set(text.split(/[^0-9]+/).map(Number).filter((n) => n > 0 && n <= max))].sort((a, b) => a - b);

  // Clicking a seat in the preview takes it out (a pillar, a short row) or puts it back
  const toggleSeat = (seat: AdminSeat) => {
    const i = rows.findIndex((r) => r.label === seat.row);
    if (i < 0) return;
    const row = rows[i];
    const cur = row.missing ?? [];
    const next = cur.includes(seat.number) ? cur.filter((n) => n !== seat.number) : [...cur, seat.number].sort((a, b) => a - b);
    if (next.length >= row.seats) {
      setMsg({ kind: "error", text: `Row ${row.label} needs at least one seat. Remove the row instead.` });
      return;
    }
    update(i, { missing: next });
    setMissingText((m) => m.map((t, j) => (j === i ? next.join(", ") : t)));
    setActive(i);
  };

  const addRow = () => {
    setMsg(null);
    const last = rows.at(-1);
    setRows((rs) => [
      ...rs,
      { label: nextLabel(rs), class_name: last?.class_name ?? "Second class", seats: last?.seats ?? 12,
        aisles_after: last?.aisles_after ?? [6], missing: [], indent: last?.indent ?? 0, gap_after: false },
    ]);
    setAisleText((a) => [...a, (last?.aisles_after ?? [6]).join(", ")]);
    setMissingText((m) => [...m, ""]);
  };

  const removeRow = (i: number) => {
    setMsg(null);
    setRows((rs) => rs.filter((_, j) => j !== i));
    setAisleText((a) => a.filter((_, j) => j !== i));
    setMissingText((m) => m.filter((_, j) => j !== i));
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const swap = <T,>(arr: T[]) => {
      const out = [...arr];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    };
    setRows(swap);
    setAisleText(swap);
    setMissingText(swap);
  };

  const save = () =>
    start(async () => {
      const toSend = Object.fromEntries([...classTotals.keys()].map((n) => [n, noteOf(n)]));
      const res = await saveLayout(rows, toSend);
      if (res.ok) {
        setRows(res.data.rows);
        setSaved(res.data.rows);
        setAisleText(res.data.rows.map((r) => r.aisles_after.join(", ")));
        setMissingText(res.data.rows.map((r) => (r.missing ?? []).join(", ")));
        setNotes(res.data.class_notes ?? {});
        setSavedNotes(res.data.class_notes ?? {});
      }
      setMsg(res.ok ? { kind: "ok", text: `Saved. ${res.data.total_seats} seats in the hall.` } : { kind: "error", text: res.error });
    });

  return (
    <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section className="card">
        <div className="border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">Rows, front to back</h2>
              <p className="text-xs text-muted">Row A is nearest the screen. Seats are numbered from the left.</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold leading-none">{seatCount}</div>
              <div className="mt-1 text-xs text-muted">seats in {rows.length} row{rows.length === 1 ? "" : "s"}</div>
            </div>
          </div>
          {classTotals.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[...classTotals.entries()].map(([name, t]) => (
                <span key={name} className="rounded-full bg-canvas px-3 py-1 text-xs text-ink-2">
                  <span className="font-bold">{name}</span> · {t.seats} seats
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2 font-bold">Row</th>
                <th className="px-2 py-2 font-bold">Class</th>
                <th className="px-2 py-2 font-bold">Seats</th>
                <th className="px-2 py-2 font-bold" title="An aisle comes after these seat numbers">Aisle after</th>
                <th className="px-2 py-2 font-bold" title="No seat at these numbers (a pillar, a shorter side). The space stays empty. You can also click a seat in the preview.">No seat at</th>
                <th className="px-2 py-2 font-bold" title="Empty spaces before seat 1">Indent</th>
                <th className="px-2 py-2 font-bold" title="Leave a walkway between this row and the next">Gap after</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody onMouseLeave={() => setActive(null)}>
              {rows.map((row, i) => {
                const cname = row.class_name.trim() || "Unnamed";
                const newClass = i === 0 || (rows[i - 1].class_name.trim() || "Unnamed") !== cname;
                const t = classTotals.get(cname);
                return (
                <Fragment key={i}>
                {newClass && (
                  <tr className="bg-canvas/60">
                    <td colSpan={8} className="border-t border-line px-4 py-1.5 text-xs">
                      <span className="font-bold uppercase tracking-wider text-ink-2">{cname}</span>
                      {t && <span className="text-muted"> · {t.rows} row{t.rows === 1 ? "" : "s"} · {t.seats} seats</span>}
                    </td>
                  </tr>
                )}
                <tr
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  className={`border-t border-line transition-colors ${active === i ? "bg-brand-soft/40" : ""} ${
                    row.gap_after ? "border-b-4 border-b-canvas" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <input
                      value={row.label}
                      onChange={(e) => update(i, { label: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })}
                      aria-label="Row letter"
                      className="field w-14 px-2 py-1.5 text-center font-bold"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      list="class-names"
                      value={row.class_name}
                      onChange={(e) => update(i, { class_name: e.target.value })}
                      aria-label="Class"
                      className="field w-32 px-2 py-1.5"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={row.seats}
                      onChange={(e) => {
                        const seats = Math.max(1, Math.min(60, Number(e.target.value) || 1));
                        update(i, { seats, missing: parseNums(missingText[i] ?? "", seats) });
                      }}
                      aria-label="Seats in row"
                      className="field w-16 px-2 py-1.5"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={aisleText[i] ?? ""}
                      onChange={(e) => {
                        const text = e.target.value;
                        setAisleText((a) => a.map((t, j) => (j === i ? text : t)));
                        const nums = text.split(/[^0-9]+/).map(Number).filter((n) => n > 0 && n < row.seats);
                        update(i, { aisles_after: [...new Set(nums)].sort((a, b) => a - b) });
                      }}
                      placeholder="e.g. 6"
                      aria-label="Aisle after seat numbers"
                      className="field w-24 px-2 py-1.5"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={missingText[i] ?? ""}
                      onChange={(e) => {
                        const text = e.target.value;
                        setMissingText((m) => m.map((t, j) => (j === i ? text : t)));
                        update(i, { missing: parseNums(text, row.seats) });
                      }}
                      placeholder="none"
                      aria-label={`No seat at these numbers in row ${row.label}`}
                      className="field w-20 px-2 py-1.5"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={row.indent}
                      onChange={(e) => update(i, { indent: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                      aria-label="Indent"
                      className="field w-16 px-2 py-1.5"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!row.gap_after}
                      disabled={i === rows.length - 1}
                      onChange={(e) => update(i, { gap_after: e.target.checked })}
                      aria-label={`Gap after row ${row.label}`}
                      title="Leave a walkway between this row and the next"
                      className="h-4 w-4 accent-brand disabled:opacity-30"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                      className="rounded px-2 py-1 text-muted hover:bg-canvas disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down"
                      className="rounded px-2 py-1 text-muted hover:bg-canvas disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => removeRow(i)} aria-label={`Remove row ${row.label}`}
                      title={`Remove row ${row.label}`}
                      className="rounded px-2 py-1 font-bold text-brand hover:bg-brand-soft">✕</button>
                  </td>
                </tr>
                </Fragment>
                );
              })}
            </tbody>
          </table>
          <datalist id="class-names">
            {classOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        {classTotals.size > 0 && (
          <div className="border-t border-line px-5 py-4">
            <h3 className="font-bold">What the seats are like</h3>
            <p className="mb-3 text-xs text-muted">Shown in the app next to each class, so customers know what they pay for. Optional.</p>
            <div className="space-y-2">
              {[...classTotals.keys()].map((name) => (
                <div key={name} className="flex flex-wrap items-center gap-3">
                  <label htmlFor={`note-${name}`} className="w-32 text-sm font-bold">{name}</label>
                  <input
                    id={`note-${name}`}
                    value={notes[name] ?? ""}
                    maxLength={200}
                    onChange={(e) => {
                      setMsg(null);
                      setNotes((n) => ({ ...n, [name]: e.target.value }));
                    }}
                    placeholder="e.g. Cushioned pushback seats, extra legroom"
                    className="field min-w-0 flex-1 px-2 py-1.5"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Stays at the bottom of the screen so Save is always in reach */}
        <div className="sticky bottom-0 z-10 rounded-b-2xl border-t border-line bg-white/95 px-5 py-4 backdrop-blur">
          {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={addRow} className="btn-secondary">+ Add row</button>
            <div className="flex-1" />
            {dirty && (
              <>
                <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                  <span className="h-2 w-2 rounded-full bg-[#f5b301]" aria-hidden />
                  Unsaved changes
                </span>
                <button type="button" onClick={discard} disabled={pending} className="btn px-3 text-sm text-muted hover:bg-canvas">
                  Discard
                </button>
              </>
            )}
            <button type="button" onClick={save} disabled={pending || !rows.length || !dirty} className="btn-primary">
              {pending ? "Saving…" : "Save layout"}
            </button>
          </div>
        </div>
      </section>

      <section className="card p-5 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100vh-3rem)] 2xl:overflow-y-auto">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="mb-1 font-bold">Preview</h2>
            <p className="text-xs text-muted">
              What customers see in the app. Click a seat to take it out (a pillar, a shorter row); click again to put it back.
              Changing a row keeps the tickets already sold for it.
            </p>
          </div>
          {activeLabel && (
            <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-[#8a1424]">Row {activeLabel}</span>
          )}
        </div>
        <SeatGrid seats={preview.seats} classes={preview.classes} selected={highlighted} onToggle={toggleSeat} />
      </section>
    </div>
  );
}
