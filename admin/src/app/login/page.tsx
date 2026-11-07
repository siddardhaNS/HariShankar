import type { Metadata } from "next";
import { BrandMark } from "@/components/Brand";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const expired = sp.expired === "1";

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <div className="font-bold">Hari Shankar</div>
            <div className="text-sm text-white/60">Picture Palace</div>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-brand">Admin console</p>
          <h1 className="page-title text-6xl">Every seat,<br />every show.</h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/70">
            Shows, prices, bookings, blocking, offers and reports for the theatre, in one place.
          </p>
        </div>
        <p className="text-xs text-white/40">Palasa</p>
        {/* Seat rows motif */}
        <div aria-hidden className="pointer-events-none absolute -bottom-6 -right-10 grid rotate-[-8deg] gap-2.5 opacity-[0.12]">
          {Array.from({ length: 7 }).map((_, r) => (
            <div key={r} className="flex gap-2.5">
              {Array.from({ length: 12 }).map((_, c) => (
                <span key={c} className="h-7 w-7 rounded-t-lg bg-white" />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <div>
              <div className="font-display text-lg font-bold uppercase leading-tight">Hari Shankar Picture Palace</div>
              <div className="text-xs text-muted">Admin console</div>
            </div>
          </div>
          <h2 className="page-title text-4xl">Log in</h2>
          <p className="mb-7 mt-2 text-[15px] text-muted">Use the mobile number and PIN the owner set up for you.</p>
          <LoginForm next={next} expired={expired} />
        </div>
      </section>
    </main>
  );
}
