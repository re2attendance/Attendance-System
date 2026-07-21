import { NextResponse, type NextRequest } from "next/server";

import { destinationFor } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the emailed links come back to — signup confirmation, and password reset.
 *
 * It used to also receive Google, and carried a check that the returned address ended in
 * the university domain, because Google's `hd` parameter lives in an editable URL and
 * could not be trusted. **That check has been removed with Google (D-084), and removing it
 * fixes a bug it had quietly introduced:** the admin account is `re2attendance@yahoo.com`,
 * which is not on the university domain, so clicking its own password-reset link would
 * have signed it straight back out again.
 *
 * Nothing is lost. Every account that can reach this point was created by our own signup —
 * where the address is derived from the index number, not typed, and enforced by
 * `profiles_email_shape` — or by hand in the dashboard, which is the admin.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/sign-in?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}${await destinationFor(supabase, data.user)}`);
}
