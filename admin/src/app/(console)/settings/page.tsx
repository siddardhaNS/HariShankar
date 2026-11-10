import type { Metadata } from "next";
import { Forbidden, PageHeader } from "@/components/PageHeader";
import { api, getMe } from "@/lib/api";
import type { Maintenance } from "@/lib/types";
import { MaintenanceForm, PasswordForm } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };

function when(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export default async function SettingsPage() {
  const me = await getMe();
  const role = me.user.role;
  if (role !== "owner" && role !== "manager" && role !== "super_admin") return <Forbidden />;

  const m = await api<Maintenance>("/api/admin/maintenance");
  const isOwner = role === "owner";

  return (
    <>
      <PageHeader title="Settings" subtitle="App maintenance" />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">App maintenance</h2>
              <p className="mt-1 text-sm text-muted">
                While it&apos;s on, customers see your message in the app instead of movies and booking.
                Gate staff can still log in and scan tickets.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                m.on ? "bg-brand text-white" : "bg-ok-soft text-[#145c33]"
              }`}
            >
              {m.on ? "On · app closed" : "Off · app open"}
            </span>
          </div>

          {m.changed_at && (
            <p className="mt-3 text-xs text-muted">
              Last changed {when(m.changed_at)}{m.changed_by ? ` by ${m.changed_by}` : ""}
            </p>
          )}

          {m.password_set ? (
            <MaintenanceForm on={m.on} message={m.message} lockedUntil={m.locked_until} />
          ) : (
            <div className="mt-5 rounded-xl bg-canvas px-4 py-3 text-sm">
              {isOwner
                ? "Set a maintenance password first (on the right). It's needed every time maintenance is turned on or off."
                : "The owner needs to set a maintenance password before maintenance can be turned on."}
            </div>
          )}
        </section>

        <section className="card h-fit p-5">
          <h2 className="font-bold">Maintenance password</h2>
          <p className="mt-1 text-sm text-muted">
            Separate from login PINs. Needed to turn maintenance on or off, or to change the message.
            5 wrong tries lock the switch for 15 minutes.
          </p>
          {isOwner ? (
            <PasswordForm passwordSet={m.password_set} />
          ) : (
            <p className="mt-4 text-sm">
              {m.password_set ? "Set. Ask the owner for it." : "Not set yet."} Only the owner can set or change it.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
