import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerRegister } from "@/components/shell/sw-register";

export const metadata: Metadata = {
  title: "Sistem Inventori Multi-Outlet",
  description:
    "PWA offline-first untuk manajemen stok, mutasi antar lokasi, dan pengeluaran outlet.",
  manifest: "/manifest.webmanifest",
  applicationName: "Inventori Multi-Outlet",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Inventori",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
