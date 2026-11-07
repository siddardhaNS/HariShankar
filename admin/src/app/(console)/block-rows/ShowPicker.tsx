"use client";

import { useRouter } from "next/navigation";

export function ShowPicker({ value, options }: { value: string; options: { id: string; label: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-ink-2">
      Applies to
      <select
        value={value}
        onChange={(e) => router.push(e.target.value ? `/block-rows?show=${e.target.value}` : "/block-rows")}
        className="field min-w-72"
      >
        <option value="">All upcoming shows</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
