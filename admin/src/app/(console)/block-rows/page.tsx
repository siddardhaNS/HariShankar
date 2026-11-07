import type { Metadata } from "next";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { dateTime, isPast } from "@/lib/format";
import type { AdminSeatMap, Show } from "@/lib/types";
import { BlockEditor } from "./BlockEditor";
import { ShowPicker } from "./ShowPicker";

export const metadata: Metadata = { title: "Block rows" };

export default async function BlockRowsPage({ searchParams }: PageProps<"/block-rows">) {
  const me = await getMe();
  if (me.user.role === "gate") return <Forbidden />;
  const sp = await searchParams;

  const shows = (await api<Show[]>("/api/admin/shows?days=14")).filter(
    (s) => s.status === "scheduled" && !isPast(s.ends_at),
  );
  const showId = typeof sp.show === "string" && shows.some((s) => s.id === sp.show) ? sp.show : null;
  const map = await api<AdminSeatMap>(`/api/admin/seatmap${showId ? `?show_id=${showId}` : ""}`);
  const current = shows.find((s) => s.id === showId);

  return (
    <>
      <PageHeader
        title="Block rows"
        subtitle="Hold back rows or seats so they can't be sold: house quota, guests, press or repair"
      >
        <ShowPicker
          value={showId ?? ""}
          options={shows.map((s) => ({ id: s.id, label: `${dateTime(s.starts_at)} · ${s.movie_title}` }))}
        />
      </PageHeader>
      <BlockEditor
        key={showId ?? "all"}
        map={map}
        showId={showId}
        scopeLabel={current ? `${dateTime(current.starts_at)} · ${current.movie_title}` : "All upcoming shows"}
      />
    </>
  );
}
