import "server-only";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * The audit trail.
 *
 * Writes go through the log_audit() RPC (0010), never a direct insert:
 * audit_log has no INSERT policy and the grant is revoked, so this is the only
 * door. It stamps actor_id from auth.uid() server-side, which means an entry
 * cannot lie about who acted — a caller cannot attribute their action to
 * someone else even by trying.
 *
 * Called by safe-action for every action that declares an audit config, so
 * nothing has to remember to call it.
 */

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * IP and user-agent for the entry.
 *
 * x-forwarded-for is client-controllable in general; behind Vercel the leftmost
 * entry is the real client and the header is rewritten at the edge. Worth
 * knowing when reading an audit row: the IP is evidence, not proof, and §7 uses
 * it to *flag* rather than to decide.
 */
async function requestContext() {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return {
      ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
      userAgent: h.get("user-agent") ?? null,
    };
  } catch {
    // No request context — a job, or a test. An audit entry without an IP is
    // still an audit entry; failing here would mean losing the record entirely.
    return { ip: null, userAgent: null };
  }
}

export async function logAudit(input: AuditInput): Promise<void> {
  const supabase = await createClient();
  const { ip, userAgent } = await requestContext();

  const { error } = await supabase.rpc("log_audit", {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? undefined,
    p_before: (input.before ?? undefined) as never,
    p_after: (input.after ?? undefined) as never,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
  });

  if (error) {
    // Deliberately loud, and deliberately NOT swallowed.
    //
    // An audit entry that silently fails to write is worse than no audit trail
    // at all: the log looks complete, and the one action someone later needs to
    // account for is the one missing. §0 says every destructive action gets an
    // audit entry — if that cannot happen, the action should not be reported as
    // having succeeded.
    throw new Error(
      `Failed to write audit entry for ${input.action}: ${error.message}`,
    );
  }
}
