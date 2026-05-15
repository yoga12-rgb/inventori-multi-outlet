import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { ConnectionPill } from "@/components/shell/connection-pill";
import { UserMenu } from "@/components/shell/user-menu";
import { OfflineFlusher } from "@/components/shell/offline-flusher";
import { RouteProgress } from "@/components/shell/route-progress";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen">
      <RouteProgress />
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="text-sm font-semibold text-slate-900">
              Inventori Multi-Outlet
            </span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <ConnectionPill />
            <UserMenu profile={session.profile} email={session.email} />
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10">{children}</main>
        <MobileNav />
        <OfflineFlusher />
      </div>
    </div>
  );
}
