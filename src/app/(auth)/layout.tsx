import Image from "next/image";
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
          aria-label="UPSA Attendance, home"
        >
          <Image
            src="/upsa-crest.png"
            alt=""
            width={384}
            height={505}
            priority
            className="h-11 w-auto"
          />
          {/* Stacked, and deliberately tight: two lines of leading-none at these sizes come
              to about 30px, so the lockup still sits inside the crest's 44px and the header
              height does not change. UPSA is the institution and carries the weight;
              Attendance is the product and steps back a shade. */}
          <span className="flex flex-col leading-none">
            <span className="text-ink text-[0.9375rem] font-extrabold tracking-tight">UPSA</span>
            <span className="text-ink-soft mt-0.5 text-[0.8125rem] font-medium tracking-tight">
              Attendance
            </span>
          </span>
        </Link>
      </header>

      {/* Left-aligned within a readable column, rather than centred: the eye starts at the
          same x for the heading, every label, and every field. */}
      <main className="w-full max-w-sm flex-1">{children}</main>
    </div>
  );
}
