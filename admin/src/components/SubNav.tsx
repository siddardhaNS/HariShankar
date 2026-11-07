"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-[0_0_0_1px_var(--color-line)] sm:inline-flex">
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition ${
              active ? "bg-ink text-white" : "text-ink-2 hover:bg-canvas"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const SHOWS_TABS = [
  { href: "/shows", label: "Show timings" },
  { href: "/shows/seats", label: "Booked seats" },
  { href: "/shows/movies", label: "Movies" },
  { href: "/shows/layout", label: "Hall layout" },
];
