import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard · Attendance" };

/**
 * Deliberately empty. Phase 1's definition of done is that a student can sign up and
 * "reach an (empty) dashboard"; what fills it arrives with attendance capture in Phase 3,
 * and inventing placeholder cards now would be production UI with no reference behind it.
 */
export default async function DashboardPage() {
  const supabase = await createClient();

  // getUser(), not getSession(): getSession() believes the cookie, getUser() asks the
  // Auth server whether the token is real. This is the gate on the whole signed-in area.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <div className="flex min-h-dvh flex-col px-6 pt-8 pb-10 sm:px-8">
      <header className="flex items-center justify-between">
        <h1 className="text-ink text-[1.75rem] font-bold tracking-[-0.02em]">
          {firstName ? `Hello, ${firstName}` : "Hello"}
        </h1>
        <form action={signOut}>
          <button
            type="submit"
            className="text-ink-soft hover:bg-sunken hover:text-ink rounded-lg px-3 py-2 text-[0.8125rem] font-medium"
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="flex flex-1 items-center justify-center">
        <p className="text-ink-faint max-w-xs text-center text-[0.9375rem]">
          Nothing here yet. Your classes and attendance will appear once your timetable is set up.
        </p>
      </main>
    </div>
  );
}
