import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { ClassOption } from "@/components/ui/class-select";
import { CompleteProfileForm } from "./complete-profile-form";

export const metadata = { title: "One last thing · UPSA Attendance" };

/**
 * The step Google leaves behind. It can prove the address and hand us a name; it has no
 * idea which class someone is in, and `profiles.class_id` is not null.
 */
export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) redirect("/dashboard");

  const { data } = await supabase
    .from("classes")
    .select("id, name, level")
    .order("level")
    .order("name");

  const classes: ClassOption[] = data ?? [];
  const suggestedName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";

  return (
    <>
      <div className="mb-8">
        <h1 className="text-ink text-[2rem] leading-[1.15] font-bold tracking-[-0.02em]">
          One last thing
        </h1>
        <p className="text-ink-soft mt-2 text-[0.9375rem]">
          We have your email. Tell us which class you are in.
        </p>
      </div>

      {/* The proven identity, shown rather than asked for. */}
      <div className="bg-accent-soft mb-6 flex items-center gap-2.5 rounded-xl px-4 py-3">
        <svg
          className="text-accent size-4 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 8.5 6 11.5 13 4.5" />
        </svg>
        <p className="text-ink-soft min-w-0 text-[0.8125rem]">
          Signed in as <span className="text-ink font-semibold break-all">{user.email}</span>
        </p>
      </div>

      {classes.length === 0 ? (
        <p
          role="status"
          className="border-line bg-sunken text-ink-soft rounded-xl border px-4 py-3.5 text-[0.875rem]"
        >
          No classes have been set up yet. Ask your administrator to add them, then come back — your
          email is already confirmed.
        </p>
      ) : (
        <CompleteProfileForm classes={classes} suggestedName={suggestedName} />
      )}
    </>
  );
}
