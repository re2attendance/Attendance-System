import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInviteForm } from "@/features/invitations/components/accept-invite-form";
import { getInvitationByToken } from "@/features/invitations/queries";

export const metadata: Metadata = {
  title: "Accept invitation · Attendance",
  // The URL contains a live credential. Keeping it out of search indexes is
  // free and the alternative is embarrassing.
  robots: { index: false, follow: false },
};

const INVALID_COPY: Record<string, string> = {
  accepted: "This invitation has already been used. If that was you, sign in.",
  revoked: "This invitation was withdrawn. Ask for a new one.",
  expired: "This invitation has expired. Ask whoever invited you to send a new one.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  /* Unknown token and spent token get DIFFERENT copy, deliberately — which is
     the opposite of the choice made on the login form.

     There, distinguishing "no such account" from "wrong password" would let
     anyone enumerate which of 10,000 addresses exist. Here, the person already
     holds a 256-bit token: they are not guessing, and telling them "expired"
     rather than "invalid" is the difference between asking for a new link and
     giving up. Nothing is leaked to someone who does not already have the
     secret. */
  if (!invitation) {
    return (
      <div className="grid gap-4">
        <h1 className="text-24 font-semibold text-ink">Invitation not found</h1>
        <p className="text-13 text-mute">
          This link doesn&rsquo;t match an invitation. Check you copied all of
          it, or ask whoever invited you to send a new one.
        </p>
        <p className="text-13">
          <Link href="/login" className="text-deep underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  if (!invitation.isValid) {
    return (
      <div className="grid gap-4">
        <h1 className="text-24 font-semibold text-ink">
          This invitation can&rsquo;t be used
        </h1>
        <p className="text-13 text-mute">
          {INVALID_COPY[invitation.invalidReason ?? ""] ??
            "This invitation is no longer valid."}
        </p>
        <p className="text-13">
          <Link href="/login" className="text-deep underline underline-offset-4">
            Go to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      email={invitation.email}
      role={invitation.role}
      institutionName={invitation.institutionName}
    />
  );
}
