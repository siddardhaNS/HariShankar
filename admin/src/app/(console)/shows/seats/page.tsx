import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { SHOWS_TABS, SubNav } from "@/components/SubNav";
import { api, getMe } from "@/lib/api";
import { addDays, dayLong, isPast, istDate, time } from "@/lib/format";
import type { AdminSeatMap, Show } from "@/lib/types";
import { BookedSeats } from "./BookedSeats";

export const metadata: Metadata = { title: "Booked seats" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function BookedSeatsPage({ searchParams }: PageProps<"/shows/seats">) {
  const me = await getMe();
  if (me.user.role === "gate") return <Forbidden />;
  const sp = await searchParams;
  const today = istDate();

  // A link from a show (?show=) can be any day; find that show's day first
  let day = typeof sp.day === "string" && DAY.test(sp.day) ? sp.day : today;
  let shows = await api<Show[]>(`/api/admin/shows?start=${day}&days=1`);
  const wanted = typeof sp.show === "string" ? sp.show : null;
  if (wanted && !shows.some((s) => s.id === wanted)) {
    const around = await api<Show[]>(`/api/admin/shows?start=${addDays(today, -14)}&days=31`);
    const hit = around.find((s) => s.id === wanted);
    if (hit) {
      day = istDate(new Date(hit.starts_at));
      shows = around.filter((s) => istDate(new Date(s.starts_at)) === day);
    }
  }
  // Default: the show running now or the next one today, else the day's first show
  const show =
    shows.find((s) => s.id === wanted) ??
    shows.find((s) => s.status === "scheduled" && !isPast(s.ends_at)) ??
    shows[0];
  const map = show ? await api<AdminSeatMap>(`/api/admin/seatmap?show_id=${show.id}`) : null;

  return (
    <>
      <PageHeader title="Shows" subtitle="Which seats are booked for each show, and by whom" />
      <SubNav items={SHOWS_TABS} />

      <section className="card mb-6 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/shows/seats?day=${addDays(day, -1)}`} className="btn-secondary px-3 py-1.5 text-sm" aria-label="Previous day">←</Link>
          <h2 className="min-w-36 text-center font-bold">{day === today ? "Today · " : ""}{dayLong(day)}</h2>
          <Link href={`/shows/seats?day=${addDays(day, 1)}`} className="btn-secondary px-3 py-1.5 text-sm" aria-label="Next day">→</Link>
          {day !== today && <Link href="/shows/seats" className="btn-secondary px-3 py-1.5 text-sm">Today</Link>}
        </div>
        {shows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No shows on this day.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {shows.map((s) => {
              const on = s.id === show?.id;
              return (
                <Link
                  key={s.id}
                  href={`/shows/seats?day=${day}&show=${s.id}`}
                  aria-current={on ? "page" : undefined}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    on ? "border-ink bg-ink text-white" : "border-line hover:border-brand"
                  }`}
                >
                  <span className={`font-bold ${s.status === "cancelled" ? "line-through" : ""}`}>{time(s.starts_at)}</span>
                  <span className={on ? "text-white/75" : "text-muted"}> · {s.movie_title} · {s.seats_sold}/{s.seats_total}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {show && map && <BookedSeats key={show.id} show={show} map={map} />}
    </>
  );
}
