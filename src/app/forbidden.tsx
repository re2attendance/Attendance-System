import Link from "next/link";

/* Rendered by forbidden() from lib/auth/guards.
 *
 * §11.7: errors say what happened and what to do. "403" says neither. This is
 * also, deliberately, not an apology — landing here is usually a stale link or
 * a role that was revoked, not a mistake the user made. */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-4 px-6 py-10">
      <h1 className="text-24 font-semibold text-ink">Not your page</h1>
      <p className="text-13 text-mute">
        Your account doesn&rsquo;t have access to this. If you think it should,
        ask an administrator — roles can be added without creating a new account.
      </p>
      <p className="text-13">
        <Link href="/" className="text-deep underline underline-offset-4">
          Go to your home page
        </Link>
      </p>
    </main>
  );
}
