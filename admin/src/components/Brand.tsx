export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[11px] bg-brand font-display font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden
    >
      HS
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  const styles = kind === "error" ? "bg-brand-soft text-[#8a1424]" : "bg-ok-soft text-[#145c33]";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
