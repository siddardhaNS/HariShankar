import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { getMe } from "@/lib/api";
import { NAV } from "@/lib/nav";

export async function generateMetadata({ params }: PageProps<"/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: NAV.find((n) => n.href === `/${section}`)?.label ?? "Not found" };
}

// Sections from the mockup that are still to be built in later milestones
export default async function SectionPage({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = NAV.find((n) => n.href === `/${section}` && !n.ready);
  if (!item) notFound();

  const me = await getMe();
  if (!item.roles.includes(me.user.role)) return <Forbidden />;

  return (
    <>
      <PageHeader title={item.label} subtitle={item.blurb} />
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <span className="rounded-full bg-canvas px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink-2">
          Coming next
        </span>
        <p className="mt-4 max-w-md text-[15px] text-muted">
          This screen is part of the next build milestone. Login, roles and staff management are ready now.
        </p>
      </div>
    </>
  );
}
