import { NextResponse, type NextRequest } from "next/server";

import { destinationFor } from "@/lib/auth/profile";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Google and the email-confirmation link both come back to.
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

  // The `hd` parameter on the Google request restricts the account chooser; it does not
  // bind anything, and it can be stripped before the request leaves the browser. So the
  // domain is checked here, where the answer comes from Google rather than from the
  // client. Without this, anyone with a personal Gmail account could sign in.
  const email = data.user.email ?? "";
  if (!email.endsWith(`@${env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN}`)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/sign-in?error=wrong_domain`);
  }

  return NextResponse.redirect(`${origin}${await destinationFor(supabase, data.user)}`);
}
