"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  ShoppingCart,
  ArrowLeftRight,
  PackageSearch,
  Database,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Beranda", icon: LayoutDashboard },
  { href: "/kasir", label: "Kasir", icon: ShoppingCart },
  { href: "/transfers", label: "Transfer", icon: ArrowLeftRight },
  { href: "/inventory", label: "Stok", icon: PackageSearch },
  { href: "/master", label: "Master", icon: Database },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs",
              active ? "text-brand-700" : "text-slate-500"
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
