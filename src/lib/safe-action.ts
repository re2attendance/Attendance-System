import "server-only";

import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { can, type Action, type Scope } from "@/lib/auth/permissions";
import { getUser, type CurrentUser } from "@/lib/auth/session";
import { AppError, ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/**
 * THE ONE CHAIN NO ACTION CAN SKIP.
 *
 * §8: "Server Actions: auth check → Zod parse → authorization check → rate
 * limit → execute → audit. Wrap this in one helper so no action can skip a
 * step." The structure doc calls this file #3 of the six that decide whether
 * this project is good, and gives the reason: "if an action can skip
 * auth/zod/authz/audit, it eventually will."
 *
 * The failure mode is what makes it worth the ceremony. A missing auth check
 * announces itself the first time someone tries. A missing AUDIT entry
 * announces itself in week 14, in a dispute, when the one action that needed
 * accounting for is the one nobody recorded. Silent gaps need structural
 * prevention, not discipline.
 *
 * So: do not write a raw Server Action. Use `authedAction` and give it a schema.
 *
 * ── the steps ────────────────────────────────────────────────────────────────
 *
 *   1. auth       — getUser(), which verifies the JWT rather than decoding a
 *                   cookie. Unauthenticated stops here.
 *   2. zod        — next-safe-action parses before the handler runs. The
 *                   handler receives typed input or is never called.
 *   3. authz      — can(user, action, scope), declared per action.
 *   4. rate limit — Phase 11 per §14. The step exists in the chain (see
 *                   below) rather than being retrofitted into 40 actions.
 *   5. execute    — the handler, with a user and an RLS-enforced client.
 *   6. audit      — automatic for any action that declares one.
 *
 * ── what this is NOT ─────────────────────────────────────────────────────────
 *
 * It is not the security boundary. RLS is (§8, ADR-005). Step 3 mirrors the
 * policies so the user gets a clean error instead of an empty result set; if it
 * were deleted, every action would still be safe and merely rude. That is the
 * test for anything added here.
 */

export type ActionContext = {
  user: CurrentUser;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

const base = createSafeActionClient({
  defineMetadataSchema() {
    return z.object({
      /** For logs and rate-limit keys. Kebab-case: "approve-attendance". */
      name: z.string(),
      /**
       * The permission this action needs. Omit only for actions any signed-in
       * user may take on their own data (RLS still decides which rows).
       */
      authorize: z.custom<Action>().optional(),
      /**
       * §0: "Every destructive action goes through a confirmation dialog and an
       * audit log entry." The dialog is the UI's job; this is the entry.
       */
      audit: z
        .object({
          action: z.string(),
          entityType: z.string(),
        })
        .optional(),
    });
  },

  handleServerError(error) {
    // Only AppError reaches the user. Everything else is a bug, an unexpected
    // Postgres error, or an RLS refusal — none of which a student can act on,
    // and all of which describe the schema to anyone reading.
    if (error instanceof AppError) return error.message;

    console.error("[safe-action] unhandled", error);
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});

/**
 * The client every action must use.
 *
 * Scope for the authz check is resolved per call via `scopeFrom`, because most
 * scopes are only knowable from the parsed input — "may this rep decide THIS
 * record" needs the record's section, which arrives with the input.
 */
export const authedAction = base.use(async ({ next, metadata }) => {
  const user = await getUser();

  if (!user) {
    throw new UnauthenticatedError();
  }

  // Global authorisation: the checks that need no input. Per-row and
  // per-section checks happen in the handler via requireScope() below, and in
  // RLS regardless.
  if (metadata?.authorize && !can(user, metadata.authorize)) {
    // Only refuse here when the permission is scope-free. A section-scoped
    // action cannot be judged without input, and refusing it now would reject
    // every rep for every section.
    const isScopeFree =
      metadata.authorize === "user.manage" ||
      metadata.authorize === "audit.read" ||
      metadata.authorize === "calendar.declare.institution" ||
      metadata.authorize === "course.manage" ||
      metadata.authorize === "rep.appoint" ||
      metadata.authorize === "report.export";

    if (isScopeFree) {
      throw new ForbiddenError();
    }
  }

  const supabase = await createClient();

  // Step 4 — rate limiting. Phase 11 (§14) wires Upstash here.
  //
  // Deliberately a comment and not a no-op function. §0 bans shipping stub
  // paths, and a `rateLimit()` that always returns true is a stub wearing a
  // seatbelt: it would read as protection in every review from now until
  // someone checks. The step is documented, the seam is obvious, and nothing
  // pretends it is enforced.

  const result = await next({ ctx: { user, supabase } satisfies ActionContext });

  // Step 6 — audit. Automatic, after the handler succeeds. A failed action is
  // not an event that happened.
  if (metadata?.audit) {
    await logAudit({
      action: metadata.audit.action,
      entityType: metadata.audit.entityType,
      entityId:
        result && typeof result === "object" && "data" in result &&
        result.data && typeof result.data === "object" && "id" in result.data
          ? String((result.data as { id: unknown }).id)
          : null,
      after: result && typeof result === "object" && "data" in result ? result.data : null,
    });
  }

  return result;
});

/**
 * Per-scope authorisation, for actions whose scope arrives with the input.
 *
 * Call it first in the handler. It mirrors the RLS policy that will run anyway
 * — the value is the error message, not the enforcement.
 */
export function requireScope(user: CurrentUser, action: Action, scope: Scope): void {
  if (!can(user, action, scope)) {
    throw new ForbiddenError();
  }
}
