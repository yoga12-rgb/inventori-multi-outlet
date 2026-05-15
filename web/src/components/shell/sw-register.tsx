"use client";

import { useEffect } from "react";

// Helper: bersihkan SW + semua cache. Dipakai saat dev, atau saat versi SW
// di sisi server berubah supaya client tidak ter-stuck di asset basi.
async function unregisterAllAndPurge() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Di dev: pastikan SW lama yang pernah ter-install di browser tidak
    // melayani asset basi (Next memutar nama file CSS/JS dengan hash setiap
    // kompilasi, dan SW lama bisa serve respons yang tidak cocok).
    if (process.env.NODE_ENV !== "production") {
      unregisterAllAndPurge().catch((err) =>
        console.warn("[sw] cleanup gagal:", err),
      );
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Saat ada SW versi baru terdeteksi, langsung suruh aktivasi
          // supaya tab terbuka tidak menahan versi lama.
          reg.addEventListener("updatefound", () => {
            const next = reg.installing;
            if (!next) return;
            next.addEventListener("statechange", () => {
              if (next.state === "installed" && navigator.serviceWorker.controller) {
                next.postMessage?.("skip-waiting");
              }
            });
          });
        })
        .catch((err) => {
          console.warn("[sw] register gagal:", err);
        });

      // Reload halaman saat controller berubah, agar respon HTML/CSS yang
      // dilayani SW baru langsung dipakai.
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
