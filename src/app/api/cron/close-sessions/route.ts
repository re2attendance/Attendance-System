import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { closeDueSessions } from "@/jobs/close-sessions";

/**
 * The auto-close cron endpoint. Vercel Cron hits this on a schedule; all it does
 * is authenticate the caller and hand off to the job. No logic lives here — the
 * closing, the absences, and the idempotency are all in close-sessions.ts and
 * the 0017 functions beneath it.
 *
 * nodejs, not edge: the job imports the service-role client, which is
 * `server-only` and depends on Node crypto/env — it must not run at the edge.
 * force-dynamic so a scheduled request is never served from a cache.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constant-time bearer check. Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>`. A plain `===` leaks the secret one byte at a time to anyone
 * who can measure the response; timingSafeEqual does not, and the length guard
 * keeps it from throwing on a mismatched length (which is itself a signal).
 */
function isAuthorised(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const { CRON_SECRET } = serverEnv();

  if (!isAuthorised(request, CRON_SECRET)) {
    // 401, and nothing else. Not "wrong secret", not "expected N bytes" — an
    // unauthenticated caller learns only that the door is locked.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await closeDueSessions();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
