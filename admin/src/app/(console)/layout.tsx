import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getMe } from "@/lib/api";
import { logout } from "@/app/actions/auth";
import { GATE_ON_WEB, navFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/types";

export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  const me = await getMe();
  if (me.user.must_change_pin) redirect("/change-pin");
  // A gate login from before scanning moved to the app: point them there
  if (me.user.role === "gate") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="page-title text-2xl">Scan tickets in the app</p>
          <p className="mt-3 text-sm text-muted">{GATE_ON_WEB}</p>
          <form action={logout} className="mt-6">
            <button type="submit" className="btn-secondary px-4 py-2 text-sm">Log out</button>
          </form>
        </div>
      </main>
    );
  }

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
