import "server-only";

import { createClient } from "@/lib/supabase/server";
import { hashToken } from "./tokens";

export type InvitationPreview = {
  email: string;
  role: string;
  scopeType: string;
  scopeId: string | null;
  institutionName: string;
  isValid: boolean;
  invalidReason: "accepted" | "revoked" | "expired" | null;
};

/**
 * Look up an invitation by its plaintext token.
 *
 * The token is hashed HERE and only the hash crosses to the database (§8:
 * hashed at rest). That is not ceremony — a plaintext token in a query is a
 * plaintext token in pg_stat_statements, in a slow-query log, and in whatever
 * that log gets shipped to.
 *
 * Returns null for a token that matches nothing, and a preview with
 * isValid: false for one that matched but is spent. The caller needs that
 * distinction to say something useful: "this link has expired" is actionable,
 * "not found" is not.
 */
export async function getInvitationByToken(
  token: string,
): Promise<InvitationPreview | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc("get_invitation_by_token_hash", { p_token_hash: hashToken(token) })
    .maybeSingle();

  if (error || !data) return null;

  return {
    email: data.email,
    role: data.role,
    scopeType: data.scope_type,
    scopeId: data.scope_id,
    institutionName: data.institution_name,
    isValid: data.is_valid,
    invalidReason: (data.invalid_reason ?? null) as InvitationPreview["invalidReason"],
  };
}
