"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMovie, type MovieInput } from "@/app/actions/ops";
import { Alert } from "@/components/Brand";
import type { Movie } from "@/lib/types";

const CERTS = ["U", "UA", "UA 7+", "UA 13+", "UA 16+", "A", "S"];
const LANGS = ["Telugu", "Hindi", "Tamil", "English", "Kannada", "Malayalam", "Odia"];
const EMPTY: MovieInput = {
  title: "", language: "Telugu", certificate: "UA", runtime_min: 150, genre: "", synopsis: "",
  poster_url: null, release_date: null, status: "coming_soon",
};

export function MovieForm({ movie }: { movie: Movie | null }) {
  const router = useRouter();
  const [m, setM] = useState<MovieInput>(movie ? { ...movie } : EMPTY);
  const [hours, setHours] = useState(Math.floor((movie?.runtime_min ?? 150) / 60));
  const [mins, setMins] = useState((movie?.runtime_min ?? 150) % 60);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const set = (patch: Partial<MovieInput>) => {
    setMsg(null);
    setM((x) => ({ ...x, ...patch }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: MovieInput = {
      ...m,
      title: m.title.trim(),
      runtime_min: hours * 60 + mins,
      poster_url: m.poster_url?.trim() || null,
      release_date: m.release_date || null,
      // Strip fields the API doesn't take
    };
    const { title, language, certificate, runtime_min, genre, synopsis, poster_url, release_date, status } = body;
    start(async () => {
      const res = await saveMovie(movie?.id ?? null, { title, language, certificate, runtime_min, genre, synopsis, poster_url, release_date, status });
      if (!res.ok) return setMsg({ kind: "error", text: res.error });
      if (movie) setMsg({ kind: "ok", text: "Saved" });
      else {
        setM(EMPTY);
        setMsg({ kind: "ok", text: `${res.data.title} added. Next, set up its shows in Show timings.` });
      }
      router.refresh();
    });
  };

  const label = "mb-1.5 block text-sm font-medium text-ink-2";
  return (
    <section className="card h-fit p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{movie ? `Edit ${movie.title}` : "Add a movie"}</h2>
        {movie && <Link href="/shows/movies" className="text-sm text-muted hover:text-ink">New movie</Link>}
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <div>
          <label htmlFor="title" className={label}>Title</label>
          <input id="title" required maxLength={120} value={m.title} onChange={(e) => set({ title: e.target.value })} className="field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lang" className={label}>Language</label>
            <input id="lang" list="langs" required maxLength={30} value={m.language} onChange={(e) => set({ language: e.target.value })} className="field" />
            <datalist id="langs">{LANGS.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
          <div>
            <label htmlFor="cert" className={label}>Certificate</label>
            <select id="cert" value={m.certificate} onChange={(e) => set({ certificate: e.target.value })} className="field">
              {CERTS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Running time</span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={5} value={hours} onChange={(e) => setHours(Number(e.target.value) || 0)} aria-label="Hours" className="field w-16 px-2" />
              <span className="text-sm text-muted">h</span>
              <input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(Number(e.target.value) || 0)} aria-label="Minutes" className="field w-16 px-2" />
              <span className="text-sm text-muted">m</span>
            </div>
          </div>
          <div>
            <label htmlFor="genre" className={label}>Genre</label>
            <input id="genre" maxLength={60} value={m.genre} onChange={(e) => set({ genre: e.target.value })} placeholder="Action drama" className="field" />
          </div>
        </div>
        <div>
          <label htmlFor="syn" className={label}>One-line story</label>
          <textarea id="syn" rows={2} maxLength={600} value={m.synopsis} onChange={(e) => set({ synopsis: e.target.value })} className="field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rel" className={label}>Release date</label>
            <input id="rel" type="date" value={m.release_date ?? ""} onChange={(e) => set({ release_date: e.target.value || null })} className="field" />
          </div>
          <div>
            <label htmlFor="status" className={label}>Status</label>
            <select id="status" value={m.status} onChange={(e) => set({ status: e.target.value as Movie["status"] })} className="field">
              <option value="coming_soon">Coming soon</option>
              <option value="now_showing">Now showing</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="poster" className={label}>Poster link (optional)</label>
          <input id="poster" type="url" pattern="https://.*" value={m.poster_url ?? ""} onChange={(e) => set({ poster_url: e.target.value })} placeholder="https://…" className="field" />
          <p className="mt-1 text-xs text-muted">Without one, the app shows a coloured poster with the title.</p>
        </div>
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Saving…" : movie ? "Save changes" : "Add movie"}
        </button>
      </form>
    </section>
  );
}
