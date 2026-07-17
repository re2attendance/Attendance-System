import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/features/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Supabase Auth sends people back to: password-reset links, email
 * confirmations, magic links.
 *
 * A Route Handler because it must set cookies and redirect, and §8 permits
 * Route Handlers exactly for this kind of thing. It exchanges the one-time code
 * in the URL for a real session.
 *
 * The `next` parameter is attacker-supplied — it arrives in a link that anyone
 * can construct and email. Unvalidated it makes this endpoint an open redirect
 * that also signs the victim in first, which is worse than the usual kind:
 * they land on the attacker's clone already authenticated and trusting the flow.
 * safeNextPath() allows only same-origin relative paths.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next")) ?? "/";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That link is missing its code. Request a new one.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired, already used, or forged. All three look the same from here, and
    // the honest message covers all three — §11.7: say what happened and what
    // to do.
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("That link has expired or has already been used. Request a new one.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
