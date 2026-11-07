import type { Metadata } from "next";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { SHOWS_TABS, SubNav } from "@/components/SubNav";
import { api, getMe } from "@/lib/api";
import type { Layout } from "@/lib/types";
import { LayoutEditor } from "./LayoutEditor";

export const metadata: Metadata = { title: "Hall layout" };

export default async function LayoutPage() {
  const me = await getMe();
  if (me.user.role === "gate") return <Forbidden />;
  const layout = await api<Layout>("/api/admin/layout");

  return (
    <>
      <PageHeader title="Shows" subtitle="Set up the hall once: rows, seat numbers, aisles and class per row" />
      <SubNav items={SHOWS_TABS} />
      <LayoutEditor initial={layout} />
    </>
  );
}
