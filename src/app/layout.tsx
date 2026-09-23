import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TimeZoneSync } from "@/components/timezone-sync";

export const metadata: Metadata = {
  title: "Walker App",
  description: "Run your dog walking business from one place.",
  applicationName: "Walker App",
  appleWebApp: { capable: true, title: "Walker", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2f7d5b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <TimeZoneSync />
        {children}
      </body>
    </html>
  );
}
