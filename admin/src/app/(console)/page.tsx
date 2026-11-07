import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getMe } from "@/lib/api";
import { homeFor } from "@/lib/nav";

export const metadata: Metadata = { title: "Today" };

const TILES = [
  { label: "Collection", hint: "Today, after refunds" },
  { label: "Tickets sold", hint: "Across all shows today" },
  { label: "Seats filled", hint: "Average across today's shows" },
  { label: "Needs checking", hint: "Payments and refunds" },
];

const SETUP = [
  { step: "Set up the hall: rows, seat numbers, aisles and class per row", href: "/shows" },
  { step: "Add the movies now showing and coming soon", href: "/shows" },
  { step: "Create a week of shows with prices for each class", href: "/shows" },
  { step: "Add your manager and gate staff logins", href: "/staff" },
];

export default async function TodayPage() {
  const me = await getMe();
  if (homeFor(me.user.role) !== "/") redirect(homeFor(me.user.role));

  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata",
  }).format(new Date());

  return (
    <>
      <PageHeader title="Today" subtitle={`${me.theatre?.name ?? ""} · ${today}`} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {TILES.map((t) => (
          <div key={t.label} className="card p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-2">{t.label}</div>
            <div className="mt-2 text-[28px] font-bold leading-none text-[#b7bbd0]">—</div>
            <div className="mt-2 text-xs text-muted">{t.hint}</div>
          </div>
        ))}
      </div>

      <section className="card mt-6 p-6">
        <h2 className="text-lg font-bold">Get the theatre ready for online booking</h2>
        <p className="mt-1 text-sm text-muted">Today&apos;s figures appear here once shows are on sale.</p>
        <ol className="mt-5 space-y-3">
          {SETUP.map((s, i) => (
            <li key={s.step} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-bold text-ink-2">
                {i + 1}
              </span>
              <Link href={s.href} className="text-[15px] hover:text-brand">{s.step}</Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
