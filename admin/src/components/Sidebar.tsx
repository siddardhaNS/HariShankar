"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { BrandMark } from "./Brand";
import type { NavItem } from "@/lib/nav";

type Props = { items: Pick<NavItem, "href" | "label">[]; theatreName: string; userName: string; roleLabel: string };

export function Sidebar({ items, theatreName, userName, roleLabel }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const [first, ...rest] = theatreName.split(" ");

  return (
    <aside className="bg-navy text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[230px] lg:shrink-0 lg:flex-col">
      <div className="flex items-center gap-3 px-5 py-4 lg:px-5 lg:pb-6 lg:pt-6">
        <BrandMark size={36} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[15px] font-bold">{first} {rest[0] ?? ""}</div>
          <div className="truncate text-xs text-white/60">{rest.slice(1).join(" ")} · {roleLabel}</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg p-2 text-white/80 hover:bg-white/10 lg:hidden"
          aria-expanded={open}
          aria-controls="admin-nav"
          aria-label="Menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <div id="admin-nav" className={`${open ? "block" : "hidden"} lg:flex lg:flex-1 lg:flex-col`}>
        <nav className="space-y-0.5 px-3 pb-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`block rounded-lg px-3 py-2.5 text-[15px] transition ${
                isActive(item.href) ? "bg-navy-2 font-bold text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 px-5 py-4 text-sm">
          <div className="truncate font-medium">{userName}</div>
          <div className="mt-2 flex gap-4 text-white/60">
            <Link href="/change-pin" className="hover:text-white">Change PIN</Link>
            <form action={logout}>
              <button type="submit" className="hover:text-white">Log out</button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
