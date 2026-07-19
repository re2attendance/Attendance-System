import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VerifyQueue } from "@/features/attendance/components/verify-queue";
import { getVerifyContext, listVerifyQueue } from "@/features/attendance/queries";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Verify · Attendance" };

// The queue is live; never serve it from a cache. Realtime keeps it fresh once
// mounted, but the first paint must be current too.
export const dynamic = "force-dynamic";

/**
 * A session's verify queue. The gate is ownership: getVerifyContext returns null
 * both when the session does not exist and when the caller cannot administer it,
 * and both become a 404 — a stranger cannot tell "no such session" from "not
 * yours". RLS refuses the writes behind this regardless; this is the mirror for
 * the read, so the page is a 404 rather than an empty shell of dead buttons.
 */
export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const context = await getVerifyContext(id, user);
  if (!context) notFound();

  const initialQueue = await listVerifyQueue(id);

  return (
    <VerifyQueue
      context={context}
      classSectionId={context.classSectionId}
      currentUserId={user.id}
      initialQueue={initialQueue}
      timezone={context.timezone}
    />
  );
}
