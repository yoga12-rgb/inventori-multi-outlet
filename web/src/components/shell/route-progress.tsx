"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Top progress bar untuk feedback navigasi.
 *
 * Strategi:
 *   - Pasang capture-listener pada `click`. Ketika user mengklik anchor
 *     internal (target sama-origin, non-modifier, non-_blank), progress
 *     langsung muncul. Itu memberi feedback dalam milidetik pertama,
 *     sebelum Next bahkan memulai navigasi.
 *   - Saat path/query berubah, progress diisi penuh lalu hilang. Karena
 *     `usePathname` di Next.js App Router hanya berubah setelah RSC payload
 *     baru tiba, ini menjadi penanda bahwa halaman tujuan sudah ready.
 *   - Maksimal 8 detik fallback supaya bar tidak tertahan kalau navigasi
 *     dibatalkan / link di-prevent oleh komponen lain.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearAllTimers() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    if (finishRef.current) {
      clearTimeout(finishRef.current);
      finishRef.current = null;
    }
  }

  function start() {
    clearAllTimers();
    setActive(true);
    setProgress(8);
    // Naik perlahan ke 80% selama navigasi RSC berlangsung.
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 80) return p;
        const remaining = 80 - p;
        return p + Math.max(1, remaining * 0.08);
      });
    }, 180);
    // Fallback: jangan biarkan bar nyangkut > 8 detik.
    fallbackRef.current = setTimeout(() => finish(), 8000);
  }

  function finish() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    setProgress(100);
    finishRef.current = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 220);
  }

  // Deteksi klik link internal.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = (e.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      // Anchor harus internal, bukan _blank, bukan download.
      const href = target.getAttribute("href");
      if (!href) return;
      if (
        target.target === "_blank" ||
        target.hasAttribute("download") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }
      try {
        const url = new URL(target.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        const samePath =
          url.pathname === window.location.pathname &&
          url.search === window.location.search;
        if (samePath) return;
      } catch {
        return;
      }
      start();
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Selesaikan progress setiap kali path/query berubah.
  useEffect(() => {
    if (!active) return;
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  // Cleanup saat unmount.
  useEffect(() => () => clearAllTimers(), []);

  if (!active && progress === 0) return null;

  return (
    <div
      role="progressbar"
      aria-label="Memuat halaman"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
    >
      <div
        className="h-full bg-brand-600 shadow-[0_0_8px_rgba(37,99,235,0.6)] transition-[width,opacity] duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: active ? 1 : 0,
        }}
      />
    </div>
  );
}
