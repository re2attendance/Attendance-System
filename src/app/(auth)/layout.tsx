import Link from "next/link";

/* The signed-out shell.

   No hero, no marketing, no illustration (§11.9 names illustrated empty states
   and hero sections as anti-tells). This is a door, and a door's job is to
   open. Centred at 360px because that is the width this is designed at — a
   student signing in on a phone in a corridor is the common case, not the edge
   one. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <Link href="/" className="text-16 font-semibold text-ink">
          Attendance
        </Link>
      </div>
      {children}
    </main>
  );
}
