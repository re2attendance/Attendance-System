import Link from "next/link";

/* Placeholder. The real root redirects by role once auth lands (Phase 3).

   Deliberately not a landing page: §11.9 names a hero section on a dashboard as
   an anti-tell, and §0 says if something isn't built yet, it isn't wired to the
   UI. This says what exists and gets out of the way. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1200px] flex-col justify-center px-6 py-10">
      <h1 className="text-xl font-semibold text-ink">Attendance</h1>
      <p className="mt-1 max-w-prose text-sm text-mute">
        University attendance management. Phase 1 — foundation. Sign-in arrives
        in Phase 3; until then the only thing built is the design system.
      </p>
      <p className="mt-4 text-sm">
        <Link
          href="/dev/tokens"
          className="text-deep underline underline-offset-4"
        >
          Design tokens
        </Link>
      </p>
    </main>
  );
}
