import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email · Attendance" };

/* Self-registration only, and self-registration is off by default (§2 Q4,
   feature flag `auth.self_registration`). An invited user never sees this page:
   receiving the invitation already proves the address, so the invite flow
   creates them confirmed.

   It exists because the flag can be turned on, and a flag that turns on a
   missing page is not a flag. */
export default function VerifyEmailPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-24 font-semibold text-ink">Check your email</h1>
      <p className="text-13 text-mute">
        We sent you a link. Open it on this device to finish signing up. The link
        expires in 24 hours.
      </p>
      <p className="text-13 text-mute">
        Nothing arrived? Check spam, then ask your course rep or an
        administrator to re-send it.
      </p>
      <p className="text-13">
        <Link href="/login" className="text-deep underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
