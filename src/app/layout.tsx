import type { Metadata, Viewport } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { TimeZoneSync } from "@/components/timezone-sync";
import { THEME_COOKIE } from "@/lib/theme";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#14130f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A manual Light/Dark choice (Profile & account) overrides the phone's setting.
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html lang="en" data-theme={theme === "light" || theme === "dark" ? theme : undefined}>
      <body className="min-h-dvh antialiased">
        <TimeZoneSync />
        {children}
      </body>
    </html>
  );
}
