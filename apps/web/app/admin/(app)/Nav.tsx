"use client";
import {
  Briefcase,
  CalendarDays,
  Laptop,
  LayoutTemplate,
  Megaphone,
  ReceiptText,
  Store,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";

/** Grup Operasional (DECISIONS #156): daftar Event dan Photobox terpisah. */
const OPS = [
  { href: "/admin", t: copy.admin.nav.events, I: CalendarDays },
  { href: "/admin/photobox", t: copy.admin.nav.photobox, I: Store },
];
const item = (on: boolean) =>
  `flex h-11 items-center lg:h-[42px] gap-3 rounded-[11px] border-[1.5px] px-3 text-sm no-underline ${on ? "border-ink bg-butter font-bold" : "border-transparent font-medium text-text-2 hover:bg-paper hover:text-ink"}`;

const items = [
  {
    href: "/admin/templates",
    t: copy.admin.nav.templates,
    I: LayoutTemplate,
    match: (p: string) => p.startsWith("/admin/templates"),
    roles: ["owner", "admin"],
  },
  {
    href: "/admin/devices",
    t: copy.admin.nav.devices,
    I: Laptop,
    match: (p: string) => p.startsWith("/admin/devices"),
  },
  {
    href: "/admin/transactions",
    t: copy.admin.nav.transactions,
    I: ReceiptText,
    match: (p: string) => p.startsWith("/admin/transactions"),
    roles: ["owner", "admin"],
  },
  {
    href: "/admin/promo",
    t: copy.admin.nav.promo,
    I: Megaphone,
    match: (p: string) => p.startsWith("/admin/promo"),
    roles: ["owner", "admin"],
  },
  {
    href: "/admin/team",
    t: copy.admin.nav.team,
    I: Users,
    match: (p: string) => p.startsWith("/admin/team"),
    roles: ["owner"],
  },
];

export function Nav({ role }: { role: string }) {
  const path = usePathname();
  const inOps = path === "/admin" || path === "/admin/photobox" || path.startsWith("/admin/events");
  return (
    <nav className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1">
        <p
          className={`flex h-[34px] items-center gap-3 px-3 text-sm ${inOps ? "font-bold" : "font-medium text-text-2"}`}
        >
          <Briefcase aria-hidden className="size-5 flex-none" strokeWidth={2} />
          {copy.admin.nav.ops}
        </p>
        {OPS.map((n) => {
          const on = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`${item(on)} ml-4 lg:h-[38px]`}
            >
              <n.I aria-hidden className="size-[18px] flex-none" strokeWidth={2} />
              {n.t}
            </Link>
          );
        })}
      </div>
      {items
        .filter((n) => !n.roles || n.roles.includes(role))
        .map((n) => {
          const on = n.match(path);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={item(on)}
            >
              <n.I aria-hidden className="size-5 flex-none" strokeWidth={2} />
              {n.t}
            </Link>
          );
        })}
    </nav>
  );
}
