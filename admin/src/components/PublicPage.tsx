import Link from "next/link";
import { BrandMark } from "@/components/Brand";

/** Public pages for app users (privacy policy, account deletion): no login needed. */
export function PublicPage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-5">
          <BrandMark size={36} />
          <div>
            <div className="font-bold leading-tight">Hari Shankar Picture Palace</div>
            <div className="text-xs text-white/60">Main Road, Palasa</div>
          </div>
        </div>
      </header>
      <article className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="page-title text-4xl">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted">Last updated {updated}</p>}
        <div className="public-prose mt-6 space-y-4 text-[15px] leading-relaxed text-ink-2">{children}</div>
        <nav className="mt-10 flex gap-4 border-t border-line pt-5 text-sm">
          <Link href="/privacy" className="text-brand underline">Privacy policy</Link>
          <Link href="/delete-account" className="text-brand underline">Delete your account</Link>
        </nav>
      </article>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-3 text-lg font-bold text-ink">{children}</h2>;
}
