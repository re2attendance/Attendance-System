import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign up · Attendance" };

/* §2 Q4: invite-only, with self-registration behind an admin toggle.
 *
 * The toggle is real — `auth.self_registration` in feature_flags — and it is
 * off. Rather than 404 on a route the product legitimately has, this explains
 * the actual situation: you cannot sign yourself up here, and here is what to
 * do instead. §11.7: an empty state is an instruction, not a mood.
 *
 * The signup FORM is deliberately not built. §0: "If something isn't built yet,
 * it isn't wired to the UI." Building a form behind an off flag would be
 * shipping an untested path that nobody exercises until the day it is switched
 * on. When someone turns the flag on, they get this page and a task.
 */
export default async function SignupPage() {
  const supabase = await createClient();
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "auth.self_registration")
    .maybeSingle();

  return (
    <div className="grid gap-4">
      <h1 className="text-24 font-semibold text-ink">Sign up</h1>

      {flag?.enabled ? (
        <p className="text-13 text-mute">
          Self-registration is switched on for this institution, but the signup
          form is not built yet. Ask an administrator to invite you.
        </p>
      ) : (
        <p className="text-13 text-mute">
          Accounts here are created by invitation. Ask your course rep or your
          department administrator to invite you, then open the link they send.
        </p>
      )}

      <p className="text-13">
        <Link href="/login" className="text-deep underline underline-offset-4">
          Already have an account? Sign in
        </Link>
      </p>
    </div>
  );
}
