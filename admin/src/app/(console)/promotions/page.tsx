import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { dayLong, rupees } from "@/lib/format";
import type { Promotion } from "@/lib/types";
import { ActiveToggle } from "./ActiveToggle";
import { PromotionForm } from "./PromotionForm";

export const metadata: Metadata = { title: "Promotions" };

function validity(p: Promotion) {
  if (p.starts_on && p.ends_on) return `${dayLong(p.starts_on)} to ${dayLong(p.ends_on)}`;
  if (p.ends_on) return `Until ${dayLong(p.ends_on)}`;
  if (p.starts_on) return `From ${dayLong(p.starts_on)}`;
  return "No end date";
}

export default async function PromotionsPage({ searchParams }: PageProps<"/promotions">) {
  const me = await getMe();
  if (me.user.role === "gate") return <Forbidden />;
  const sp = await searchParams;
  const promos = await api<Promotion[]>("/api/admin/promotions");
  const editing = typeof sp.edit === "string" ? promos.find((p) => p.id === sp.edit) ?? null : null;
  const given = promos.reduce((a, p) => a + p.discount_given_paise, 0);

  return (
    <>
      <PageHeader title="Promotions" subtitle="Promo codes customers use at checkout. The discount comes off ticket prices only, not the booking fee." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
            <h2 className="font-bold">All codes <span className="ml-1 text-muted">{promos.length}</span></h2>
            <span className="text-sm text-muted">{rupees(given)} given as discounts on paid bookings</span>
          </div>
          {promos.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No promo codes yet. Add the first one.</p>
          ) : (
            <ul className="divide-y divide-line">
              {promos.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 ${editing?.id === p.id ? "bg-brand-soft/40" : ""} ${p.is_active ? "" : "opacity-60"}`}>
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-navy px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-white">{p.code}</span>
                      <span className="font-bold">{p.title}</span>
                      {!p.show_in_app && <span className="rounded-full bg-[#e9eaf1] px-2 py-0.5 text-[11px] font-bold uppercase text-muted">Code only</span>}
                    </div>
                    <div className="mt-1 text-sm text-muted">{p.details} · {validity(p)}</div>
                  </div>
                  <div className="w-36 text-sm">
                    <div>{p.uses}{p.max_uses ? ` of ${p.max_uses}` : ""} booking{(p.max_uses ?? p.uses) === 1 ? "" : "s"}</div>
                    <div className="text-muted">{rupees(p.discount_given_paise)} off</div>
                  </div>
                  <ActiveToggle id={p.id} active={p.is_active} />
                  <Link href={`/promotions?edit=${p.id}`} className="btn-secondary px-3 py-1.5 text-sm">Edit</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <PromotionForm key={editing?.id ?? "new"} promo={editing} />
      </div>
    </>
  );
}
