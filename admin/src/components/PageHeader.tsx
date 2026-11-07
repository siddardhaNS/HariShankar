export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="page-title text-[32px] sm:text-[36px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function Forbidden() {
  return (
    <div className="card p-8 text-center">
      <p className="page-title text-2xl">Not for your role</p>
      <p className="mt-2 text-sm text-muted">Ask the owner if you need access to this page.</p>
    </div>
  );
}
