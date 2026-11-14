import type { Metadata } from "next";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import { ROLE_HINT, ROLE_LABEL, type Staff, type TestLogin } from "@/lib/types";
import { AddStaffForm, StaffRowActions } from "./StaffForms";
import { TestLogins } from "./TestLogins";

export const metadata: Metadata = { title: "Staff" };

function lastSeen(iso: string | null) {
  if (!iso) return "Never logged in";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export default async function StaffPage() {
  const me = await getMe();
  if (me.user.role !== "owner" && me.user.role !== "super_admin") return <Forbidden />;

  const [staff, testLogins] = await Promise.all([
    api<Staff[]>("/api/admin/staff"),
    api<TestLogin[]>("/api/admin/test-logins"),
  ]);

  return (
    <>
      <PageHeader title="Staff" subtitle="Logins for the admin web, and for the gate scanner in the app" />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-bold">All logins <span className="ml-1 text-muted">{staff.length}</span></h2>
          </div>
          <ul className="divide-y divide-line">
            {staff.map((s) => (
              <li key={s.id} className={`flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 ${s.is_active ? "" : "bg-canvas/60"}`}>
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2 font-bold">
                    {s.name}
                    {s.id === me.user.id && <span className="text-xs font-normal text-muted">(you)</span>}
                    {!s.is_active && (
                      <span className="rounded-full bg-[#e9eaf1] px-2 py-0.5 text-[11px] font-bold uppercase text-muted">Disabled</span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[13px] text-muted">{s.mobile}</div>
                </div>
                <div className="w-[170px] text-sm">
                  <div className="font-medium">{ROLE_LABEL[s.role]}</div>
                  <div className="text-xs text-muted">{s.role !== "super_admin" && ROLE_HINT[s.role]}</div>
                </div>
                <div className="w-[150px] text-xs text-muted">
                  {s.must_change_pin && s.is_active ? "Has to set own PIN" : lastSeen(s.last_login_at)}
                </div>
                {s.id !== me.user.id ? <StaffRowActions staff={s} /> : <div className="hidden sm:block sm:w-[290px]" />}
              </li>
            ))}
          </ul>
        </section>

        <AddStaffForm />
      </div>

      <TestLogins logins={testLogins} />
    </>
  );
}
