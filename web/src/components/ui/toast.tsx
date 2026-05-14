"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import clsx from "clsx";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type Ctx = {
  toast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <ToastItem
            key={t.id}
            toast={t}
            onClose={() => setItems((prev) => prev.filter((p) => p.id !== t.id))}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon =
    toast.kind === "success"
      ? CheckCircle2
      : toast.kind === "error"
        ? AlertCircle
        : Info;

  return (
    <div
      role="status"
      className={clsx(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg",
        toast.kind === "success" && "border-emerald-200",
        toast.kind === "error" && "border-red-200",
        toast.kind === "info" && "border-slate-200"
      )}
    >
      <Icon
        className={clsx(
          "mt-0.5 h-5 w-5 shrink-0",
          toast.kind === "success" && "text-emerald-600",
          toast.kind === "error" && "text-red-600",
          toast.kind === "info" && "text-brand-600"
        )}
      />
      <div className="flex-1 text-sm text-slate-700">{toast.message}</div>
      <button
        type="button"
        aria-label="Tutup notifikasi"
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam ToastProvider");
  return ctx;
}

export function useEphemeralWindowToast(message: string | null) {
  const { toast } = useToast();
  useEffect(() => {
    if (message) toast(message, "info");
  }, [message, toast]);
}
