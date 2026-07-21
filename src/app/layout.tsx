import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { readTheme } from "@/lib/theme-server";

import "./globals.css";

// Plus Jakarta Sans over Inter or Geist: both are the default of every framework starter,
// which is the borrowed quality the owner asked us to avoid. Jakarta's wider apertures
// and taller x-height also hold up better at the small sizes a phone form runs at.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "UPSA Attendance",
  description: "Record and verify class attendance.",
};

export const viewport: Viewport = {
  // Matches --color-surface in each theme, so the browser chrome does not sit as a
  // white band above a dark page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1020" },
  ],
  width: "device-width",
  initialScale: 1,
  // Zoom is left enabled. Disabling it is the usual reflex for an app-like feel, and it
  // takes magnification away from anyone who needs it.
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = await readTheme();

  return (
    // `data-theme` is omitted for "system" so the prefers-color-scheme query stays in
    // charge; an explicit value beats it. Set here, server-side, so the correct theme is
    // in the HTML before first paint rather than snapping into place after hydration.
    <html
      lang="en"
      className={jakarta.variable}
      data-theme={theme === "system" ? undefined : theme}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
