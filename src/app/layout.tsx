import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

/* §11.2 — Inter is boring on purpose. This is a data-dense product and the
   type's job is legibility at 13px, not personality. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/* Every matric number, session code, timestamp, percentage and table figure.
   This is the one place the interface gets a voice, and it's the right one:
   the app is *about* numbers and identifiers lining up. */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Attendance",
  description: "University attendance management",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /* suppressHydrationWarning is required by next-themes: it writes the theme
       class onto <html> before paint, which is what buys us "no flash on load"
       (§11.8). The warning it suppresses is that intended mismatch, and nothing
       else — it does not silence hydration errors in the tree below. */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
