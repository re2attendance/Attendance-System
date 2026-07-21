import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

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
  title: "Attendance",
  description: "Record and verify class attendance.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  // Zoom is left enabled. Disabling it is the usual reflex for an app-like feel, and it
  // takes magnification away from anyone who needs it.
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
