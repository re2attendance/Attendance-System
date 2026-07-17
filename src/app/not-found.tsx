import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-24 font-semibold text-ink">Page not found</h1>
      <p className="text-13 text-mute">
        That link doesn&rsquo;t go anywhere. It may have been a session that has
        since closed.
      </p>
      <p className="text-13">
        <Link href="/" className="text-deep underline underline-offset-4">
          Go to your home page
        </Link>
      </p>
    </main>
  );
}
