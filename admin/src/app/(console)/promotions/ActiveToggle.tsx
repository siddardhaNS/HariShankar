"use client";

import { useTransition } from "react";
import { setPromotionActive } from "@/app/actions/ops";

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await setPromotionActive(id, !active)))}
      className={`w-24 rounded-full px-3 py-1.5 text-sm font-bold ${active ? "bg-ok-soft text-[#145c33]" : "bg-[#e9eaf1] text-muted"}`}
      aria-pressed={active}
      title={active ? "Turn off: customers can no longer use it" : "Turn on"}
    >
      {pending ? "…" : active ? "On" : "Off"}
    </button>
  );
}
