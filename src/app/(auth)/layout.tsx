import Link from "next/link";

/**
 * The shell every auth screen sits in.
 *
 * No card. The reference floats a white panel on grey, which is the layout of every auth
 * template in circulation; edge-to-edge content with a left-aligned column reads as an
 * application rather than a form someone dropped onto a page, and it gives the five-field
 * signup room without scrolling on a small phone.
 *
 * `min-h-dvh`, not `min-h-screen`: on mobile Safari `100vh` is taller than the visible
 * area, so the submit button sits under the browser chrome exactly when the keyboard is
 * open and it is needed.
 */
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col px-6 pt-8 pb-10 sm:px-8">
      <header className="mb-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-lg"
          aria-label="Attendance, home"
        >
          <Mark />
          <span className="text-ink text-[0.9375rem] font-bold tracking-tight">Attendance</span>
        </Link>
      </header>

      {/* Left-aligned within a readable column, rather than centred: the eye starts at the
          same x for the heading, every label, and every field. */}
      <main className="w-full max-w-sm flex-1">{children}</main>
    </div>
  );
}

/**
 * The mark: a checked register line. Two rows of a class list, the top one ticked.
 * It says "attendance" without a building, a graduation cap, or a location pin.
 */
function Mark() {
  return (
    <span className="bg-brand-600 text-on-brand grid size-9 place-items-center rounded-[0.625rem]">
      <svg
        className="size-5"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6.5 4.8 8.3 8.2 4.9" />
        <path d="M11.5 6.6H17" />
        <path d="M3 13.5h5.2" />
        <path d="M11.5 13.5H17" />
      </svg>
    </span>
  );
}
