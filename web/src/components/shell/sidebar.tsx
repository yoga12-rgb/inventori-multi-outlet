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
  History,
  Boxes,
  Package,
  PackagePlus,
  MapPin,
  Users as UsersIcon,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kasir", label: "Kasir", icon: ShoppingCart },
  { href: "/transaksi", label: "Transaksi", icon: History },
  { href: "/transfers", label: "Transfer", icon: ArrowLeftRight },
  { href: "/production", label: "Produksi", icon: PackagePlus },
  { href: "/inventory", label: "Inventory", icon: PackageSearch },
  { href: "/master/products", label: "Produk", icon: Package },
  { href: "/master/locations", label: "Lokasi", icon: MapPin },
  { href: "/master/users", label: "Pengguna", icon: UsersIcon },
  { href: "/master", label: "Master Data", icon: Database },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Boxes className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Inventori
          </p>
          <p className="text-sm font-semibold text-slate-900">Multi-Outlet</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-400">
        Phase 1 · UI shell
      </div>
    </aside>
  );
}
