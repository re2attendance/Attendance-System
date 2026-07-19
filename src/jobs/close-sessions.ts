import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The auto-close job. Closes every open session that is past its close time and
 * writes the absences for students who never checked in.
 *
 * This is a `src/jobs/*` file (PLAN §"Jobs"): the ONE place, with the cron
 * routes, allowed to reach the service-role client. There is no user here — a
 * session closes because the clock said so, and the absences it writes belong
 * to students who are, by definition, not logged in. RLS has no JWT to enforce
 * against, so the work runs outside it and the SECURITY DEFINER functions carry
 * their own authorisation (the `auth.uid() is null` service-role path in 0017).
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 * The exit criterion for Phase 5 is "idempotent under double-fire", and it is
 * defended in three independent layers, weakest-caller-wins:
 *
 *   1. close_session (0010) writes nothing for an already-closed session, so
 *      close_due_sessions re-selects nothing on a second pass. Even a naked
 *      double-call cannot double-write an absence.
 *   2. This job claims a `job_runs` row keyed by a time bucket BEFORE doing any
 *      work. `unique (job_name, run_key)` makes the second of two concurrent
 *      fires lose the insert race (23505) and return `deduped` without touching
 *      a single session — the honest, cheap short-circuit.
 *   3. The route wrapper is bearer-authed, so a stranger cannot fire it at all.
 *
 * Layer 1 is the real guarantee; 2 exists so a burst of retries is one unit of
 * work with one audit trail, not N.
 */

const JOB_NAME = "close-sessions";
const UNIQUE_VIOLATION = "23505";

export type CloseSessionsResult =
  | { deduped: true; runKey: string }
  | { deduped: false; runKey: string; sessionsClosed: number; absencesWritten: number };

/**
 * A UTC minute bucket: two fires within the same minute share a run_key and so
 * collapse to one run. The cron fires on a coarse schedule (minutes, not
 * seconds), so the minute is a comfortable window for "the same scheduled tick,
 * possibly retried" without ever merging two genuinely separate ticks.
 */
function currentRunKey(now: Date): string {
  return `${JOB_NAME}:${now.toISOString().slice(0, 16)}Z`;
}

export async function closeDueSessions(
  runKey: string = currentRunKey(new Date()),
): Promise<CloseSessionsResult> {
  const supabase = createAdminClient();

  // Claim the window. Insert-first, work-second: whoever wins this insert owns
  // the run; a concurrent fire hits the unique index and bows out.
  const claim = await supabase
    .from("job_runs")
    .insert({ job_name: JOB_NAME, run_key: runKey, status: "running" })
    .select("id")
    .single();

  if (claim.error) {
    if (claim.error.code === UNIQUE_VIOLATION) {
      return { deduped: true, runKey };
    }
    throw new Error(`close-sessions: could not claim run ${runKey}: ${claim.error.message}`);
  }

  const runId = claim.data.id;

  try {
    const { data, error } = await supabase.rpc("close_due_sessions");
    if (error) throw new Error(error.message);

    // close_due_sessions returns a single (closed, absences) row.
    const row = data?.[0] ?? { closed: 0, absences: 0 };
    const result = {
      sessionsClosed: row.closed ?? 0,
      absencesWritten: row.absences ?? 0,
    };

    await supabase
      .from("job_runs")
      .update({ status: "succeeded", finished_at: new Date().toISOString(), result })
      .eq("id", runId);

    return { deduped: false, runKey, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Record the failure on the claimed row so the run is not left dangling in
    // 'running' forever, then re-throw for the route to turn into a 500.
    await supabase
      .from("job_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
      .eq("id", runId);
    throw new Error(`close-sessions: run ${runKey} failed: ${message}`);
  }
}
