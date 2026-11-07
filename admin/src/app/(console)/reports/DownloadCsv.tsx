"use client";

/** Builds the CSV in the browser from the rows already on the page. */
export function DownloadCsv({ label = "Download CSV", filename, header, rows }: { label?: string; filename: string; header: string[]; rows: (string | number)[][] }) {
  const download = () => {
    const cell = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" onClick={download} className="btn-secondary px-3 py-1.5 text-sm">
      {label}
    </button>
  );
}
