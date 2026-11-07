"use client";

import { useMemo, useState, useTransition } from "react";
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
        id: `${row.label}${n}`, row: row.label, number: n, r, c, class_id: name, state: "free",
        block_id: null, block_reason: null, block_all_shows: false, booking_code: null, booked_by: null,
      });
      c += row.aisles_after.includes(n) ? 2 : 1;
    }
    r += 1;
  }
  return { seats, classes };
}

export function LayoutEditor({ initial }: { initial: Layout }) {
  const [rows, setRows] = useState<LayoutRow[]>(initial.rows);
  const [aisleText, setAisleText] = useState<string[]>(initial.rows.map((r) => r.aisles_after.join(", ")));
  const [saved, setSaved] = useState<LayoutRow[]>(initial.rows);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const preview = useMemo(() => previewSeats(rows), [rows]);
  const classOptions = [...new Set([...DEFAULT_CLASSES, ...rows.map((r) => r.class_name)])];
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);

  const update = (i: number, patch: Partial<LayoutRow>) => {
    setMsg(null);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setMsg(null);
    const last = rows.at(-1);
    setRows((rs) => [
      ...rs,
      { label: nextLabel(rs), class_name: last?.class_name ?? "Second class", seats: last?.seats ?? 12,
        aisles_after: last?.aisles_after ?? [6], indent: last?.indent ?? 0 },
    ]);
    setAisleText((a) => [...a, (last?.aisles_after ?? [6]).join(", ")]);
  };

  const removeRow = (i: number) => {
    setMsg(null);
    setRows((rs) => rs.filter((_, j) => j !== i));
    setAisleText((a) => a.filter((_, j) => j !== i));
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
  };

  const save = () =>
    start(async () => {
      const res = await saveLayout(rows);
      if (res.ok) {
        setRows(res.data.rows);
        setSaved(res.data.rows);
      }
      setMsg(res.ok ? { kind: "ok", text: `Saved. ${res.data.total_seats} seats in the hall.` } : { kind: "error", text: res.error });
    });

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-bold">Rows, front to back</h2>
            <p className="text-xs text-muted">Row A is nearest the screen. Seats are numbered from the left.</p>
          </div>
          <span className="text-sm text-muted">{preview.seats.length} seats</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-2 font-bold">Row</th>
                <th className="px-2 py-2 font-bold">Class</th>
                <th className="px-2 py-2 font-bold">Seats</th>
                <th className="px-2 py-2 font-bold" title="An aisle comes after these seat numbers">Aisle after</th>
                <th className="px-2 py-2 font-bold" title="Empty spaces before seat 1">Indent</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, i) => (
                <tr key={i}>
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
                      className="field min-w-36 px-2 py-1.5"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={row.seats}
                      onChange={(e) => update(i, { seats: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
                      aria-label="Seats in row"
                      className="field w-20 px-2 py-1.5"
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
                      className="field w-28 px-2 py-1.5"
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
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                      className="rounded px-2 py-1 text-muted hover:bg-canvas disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down"
                      className="rounded px-2 py-1 text-muted hover:bg-canvas disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => removeRow(i)} aria-label={`Remove row ${row.label}`}
                      className="rounded px-2 py-1 text-brand hover:bg-brand-soft">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="class-names">
            {classOptions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
          <button type="button" onClick={addRow} className="btn-secondary">+ Add row</button>
          <div className="flex-1" />
          {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
          <button type="button" onClick={save} disabled={pending || !rows.length} className="btn-primary">
            {pending ? "Saving…" : "Save layout"}
          </button>
        </div>
        {msg && <div className="px-5 pb-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-bold">Preview</h2>
        <p className="mb-5 text-xs text-muted">What customers see in the app. Changing a row keeps the tickets already sold for it.</p>
        <SeatGrid seats={preview.seats} classes={preview.classes} />
      </section>
    </div>
  );
}
