import type { SupabaseClient, User } from "@supabase/supabase-js";

import { INDEX_NUMBER } from "@/lib/validation/identity";

/**
 * Where a freshly authenticated user should land.
 *
 * A Supabase auth user is not yet a student: `profiles` is what makes them one (0004).
 * A confirmed signup arrives here with a session and no profile row, so this is the single
 * place that decides whether we can create one or have to ask for the missing piece.
 */
export async function destinationFor(
  supabase: SupabaseClient,
  user: User,
): Promise<"/dashboard" | "/complete-profile"> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) return "/dashboard";

  // Carried in user_metadata since signup. Not trusted: 0004's constraints are what
  // decide whether the row is allowed, and the insert below fails if they disagree.
  const indexNumber = user.user_metadata?.index_number;
  const classId = user.user_metadata?.class_id;
  const fullName = user.user_metadata?.full_name ?? user.user_metadata?.name;

  // Signup stores all three, so this normally passes and the profile is created here.
  // It fails for an account created outside the signup form — the admin, made by hand in
  // the dashboard — which is why /complete-profile still exists as the way back.
  if (
    typeof indexNumber !== "string" ||
    typeof classId !== "string" ||
    typeof fullName !== "string" ||
    !INDEX_NUMBER.test(indexNumber)
  ) {
    return "/complete-profile";
  }

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    full_name: fullName,
    index_number: indexNumber,
    email: user.email,
    class_id: classId,
  });

  // A constraint refused the row — a class that has since been deleted, an index that
  // does not match the address. Ask rather than guess.
  return error ? "/complete-profile" : "/dashboard";
}
