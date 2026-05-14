"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 10 * 60 * 1000; // 10 menit, sesuai API.md

export function DashboardAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof navigator === "undefined" || navigator.onLine) {
        router.refresh();
      }
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
