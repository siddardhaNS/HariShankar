import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getMe } from "@/lib/api";
import { navFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/types";

export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  const me = await getMe();
  if (me.user.must_change_pin) redirect("/change-pin");

  const items = navFor(me.user.role).map(({ href, label }) => ({ href, label }));

  return (
    <div className="lg:flex">
      <Sidebar
        items={items}
        theatreName={me.theatre?.name ?? "Platform admin"}
        userName={me.user.name}
        roleLabel={ROLE_LABEL[me.user.role]}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
