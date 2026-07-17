import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";

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
          {/* nuqs keeps table filters and page numbers in the URL (ADR-004), so
              a rep can share or reload a filtered queue. The adapter is what
              lets it write to Next's router. */}
          <NuqsAdapter>{children}</NuqsAdapter>
          {/* §11.6 requires a 5-second undo toast on every rep decision, so the
              toaster lives at the root rather than in the (app) group — a toast
              must survive the navigation that triggered it.

              Styled to the tokens, because sonner ships its own palette and
              §11.9 names a stray accent as an anti-tell. richColors is
              deliberately off: it would paint success green and error red from
              sonner's own scale, and our status colours are desaturated ~20%
              for a reason (§11.3). */}
          <Toaster
            position="bottom-center"
            toastOptions={{
              classNames: {
                toast:
                  "!bg-paper !text-ink !border !border-line !rounded-card !text-13 !font-sans",
                description: "!text-mute",
                actionButton: "!bg-signal !text-ink !rounded-control",
                cancelButton: "!bg-wash !text-mute !rounded-control",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
