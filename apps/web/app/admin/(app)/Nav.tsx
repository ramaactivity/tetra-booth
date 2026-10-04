"use client";
import { CalendarDays, Laptop, LayoutTemplate, ReceiptText, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";

const items = [
  {
    href: "/admin",
    t: copy.admin.nav.events,
    I: CalendarDays,
    match: (p: string) => p === "/admin" || p.startsWith("/admin/events"),
  },
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
    href: "/admin/team",
    t: copy.admin.nav.team,
    I: Users,
    match: (p: string) => p.startsWith("/admin/team"),
    roles: ["owner"],
  },
];

export function Nav({ role }: { role: string }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1.5">
      {items
        .filter((n) => !n.roles || n.roles.includes(role))
        .map((n) => {
          const on = n.match(path);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`flex h-[42px] items-center gap-3 rounded-[11px] border-[1.5px] px-3 text-sm no-underline ${on ? "border-ink bg-butter font-bold" : "border-transparent font-medium text-text-2 hover:bg-paper hover:text-ink"}`}
            >
              <n.I aria-hidden className="size-5 flex-none" strokeWidth={2} />
              {n.t}
            </Link>
          );
        })}
    </nav>
  );
}
