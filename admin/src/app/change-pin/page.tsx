import type { Metadata } from "next";
import Link from "next/link";
import { getMe } from "@/lib/api";
import { BrandMark } from "@/components/Brand";
import { ChangePinForm } from "./ChangePinForm";

export const metadata: Metadata = { title: "Change PIN" };

export default async function ChangePinPage() {
  const { user } = await getMe();
  const forced = user.must_change_pin;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark size={36} />
          <div className="text-sm text-muted">Logged in as <b className="text-ink">{user.name}</b></div>
        </div>
        <h1 className="page-title text-3xl">{forced ? "Set your PIN" : "Change PIN"}</h1>
        <p className="mb-6 mt-2 text-sm text-muted">
          {forced
            ? "You're using a PIN someone else set. Choose your own before you continue."
            : "Other devices will be logged out."}
        </p>
        <ChangePinForm />
        {!forced && (
          <Link href="/" className="mt-4 block text-center text-sm text-muted hover:text-ink">
            Cancel
          </Link>
        )}
      </div>
    </main>
  );
}
