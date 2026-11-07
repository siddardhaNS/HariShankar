"use client";

import { useTransition } from "react";
import { cancelCampaign } from "@/app/actions/ops";

export function CancelButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await cancelCampaign(id)))}
      className="text-sm font-bold text-brand disabled:opacity-60"
    >
      {pending ? "Stopping…" : "Stop sending"}
    </button>
  );
}
