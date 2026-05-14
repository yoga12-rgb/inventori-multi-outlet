"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import clsx from "clsx";
import { countQueue, subscribeQueue } from "@/lib/offline/queue";

export function ConnectionPill() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const sync = async () => setQueued(await countQueue());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    sync();
    const off = subscribeQueue(sync);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = setInterval(sync, 5000);
    return () => {
      off();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
          online
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700"
        )}
        title={online ? "Online" : "Offline"}
      >
        {online ? <Wifi className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        {online ? "Online" : "Offline"}
      </span>
      {queued > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          <RefreshCw className="h-3.5 w-3.5" />
          {queued} antrean
        </span>
      )}
    </div>
  );
}
