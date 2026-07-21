import Link from "next/link";

export const metadata = { title: "Check your email · UPSA Attendance" };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;

  return (
    <>
      <span className="bg-brand-50 mb-6 grid size-12 place-items-center rounded-xl">
        <svg
          className="text-brand-600 size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="m3.5 7.5 7.2 5a2.2 2.2 0 0 0 2.6 0l7.2-5" />
        </svg>
      </span>

      <h1 className="text-ink text-[2rem] leading-[1.15] font-bold tracking-[-0.02em]">
        Confirm your email
      </h1>
      <p className="text-ink-soft mt-2 text-[0.9375rem]">
        We sent a link to{" "}
        {to ? (
          <span className="text-ink font-semibold break-all">{to}</span>
        ) : (
          "your university email"
        )}
        . Open it to finish setting up your account.
      </p>

      {/* Said plainly, because it is the difference between "this is broken" and "wait
          a moment": the link is what proves the address is yours, which is what stops
          someone else registering under your index number. */}
      <p className="border-line bg-sunken text-ink-soft mt-6 rounded-xl border px-4 py-3.5 text-[0.8125rem]">
        The link confirms the address belongs to you. Until it is opened, nobody can record
        attendance under your index number — including you.
      </p>

      <p className="text-ink-soft mt-8 text-[0.9375rem]">
        Wrong address?{" "}
        <Link href="/sign-up" className="text-brand-600 hover:text-brand-700 rounded font-semibold">
          Start again
        </Link>
      </p>
    </>
  );
}
