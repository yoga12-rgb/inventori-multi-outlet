"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeftRight,
  Boxes,
  BookOpen,
  Database,
  History,
  LayoutDashboard,
  type LucideIcon,
  MapPin,
  Package,
  PackagePlus,
  PackageSearch,
  ShoppingCart,
  Tags,
  Users as UsersIcon,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

type Group = {
  label: string;
  items: Item[];
};

// Pengelompokan dibuat berdasarkan alur kerja harian:
//   Operasional   → semua aktivitas yang dijalankan kasir/operator outlet.
//   Produksi & Stok → input produksi gudang dan visibilitas stok.
//   Master Data   → konfigurasi acuan (Super Admin).
//   Bantuan       → dokumentasi penggunaan in-app.
const GROUPS: Group[] = [
  {
    label: "Operasional",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/kasir", label: "Kasir", icon: ShoppingCart },
      { href: "/transaksi", label: "Transaksi", icon: History },
      { href: "/transfers", label: "Transfer", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Produksi & Stok",
    items: [
      { href: "/production", label: "Produksi", icon: PackagePlus },
      { href: "/inventory", label: "Inventory", icon: PackageSearch },
    ],
  },
  {
    label: "Master Data",
    items: [
      { href: "/master/products", label: "Produk", icon: Package },
      { href: "/master/categories", label: "Kategori", icon: Tags },
      { href: "/master/locations", label: "Lokasi", icon: MapPin },
      { href: "/master/users", label: "Pengguna", icon: UsersIcon },
      { href: "/master", label: "Ringkasan Master", icon: Database, exact: true },
    ],
  },
  {
    label: "Bantuan",
    items: [{ href: "/panduan", label: "Panduan Penggunaan", icon: BookOpen }],
  },
];

function isActive(pathname: string, item: Item) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 self-start border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
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

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {GROUPS.map((group, idx) => (
          <div key={group.label} className={clsx(idx > 0 && "mt-6")}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
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
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-400">
        Phase 1 · UI shell
      </div>
    </aside>
  );
}
