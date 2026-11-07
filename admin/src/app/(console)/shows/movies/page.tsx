import type { Metadata } from "next";
import Link from "next/link";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { SHOWS_TABS, SubNav } from "@/components/SubNav";
import { api, getMe } from "@/lib/api";
import { dayLong } from "@/lib/format";
import type { Movie } from "@/lib/types";
import { MovieForm } from "./MovieForm";

export const metadata: Metadata = { title: "Movies" };

const STATUS: Record<Movie["status"], { label: string; cls: string }> = {
  now_showing: { label: "Now showing", cls: "bg-ok-soft text-[#145c33]" },
  coming_soon: { label: "Coming soon", cls: "bg-[#fff4c2] text-[#7a5b00]" },
  archived: { label: "Archived", cls: "bg-[#e9eaf1] text-muted" },
};

export default async function MoviesPage({ searchParams }: PageProps<"/shows/movies">) {
  const me = await getMe();
  if (me.user.role === "gate") return <Forbidden />;
  const sp = await searchParams;
  const movies = await api<Movie[]>("/api/admin/movies");
  const editing = typeof sp.edit === "string" ? movies.find((m) => m.id === sp.edit) ?? null : null;

  return (
    <>
      <PageHeader title="Shows" subtitle="Movies the theatre is showing or will show" />
      <SubNav items={SHOWS_TABS} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">All movies <span className="ml-1 text-muted">{movies.length}</span></h2>
          </div>
          {movies.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No movies yet. Add the first one.</p>
          ) : (
            <ul className="divide-y divide-line">
              {movies.map((m) => (
                <li key={m.id} className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 ${editing?.id === m.id ? "bg-brand-soft/40" : ""}`}>
                  <div className="min-w-[200px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{m.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS[m.status].cls}`}>
                        {STATUS[m.status].label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-muted">
                      {[m.language, m.certificate, `${Math.floor(m.runtime_min / 60)}h ${m.runtime_min % 60}m`, m.genre].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="w-36 text-sm text-muted">{m.release_date ? `Release ${dayLong(m.release_date)}` : "No release date"}</div>
                  <div className="w-28 text-sm">{m.upcoming_shows} upcoming show{m.upcoming_shows === 1 ? "" : "s"}</div>
                  <Link href={`/shows/movies?edit=${m.id}`} className="btn-secondary px-3 py-1.5 text-sm">Edit</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <MovieForm key={editing?.id ?? "new"} movie={editing} />
      </div>
    </>
  );
}
