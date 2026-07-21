import { redirect } from "next/navigation";

import { destinationFor } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * The gate on everything behind sign-in.
 *
 * It lives in the layout rather than in each page because there are several ways to arrive
 * with a session and no profile, and only one of them used to be handled. `/auth/callback`
 * called `destinationFor` after a confirmation link; signing in with a
 * password redirected straight to `/dashboard`, which never asked whether the account had
 * finished onboarding — so anyone whose confirmation link had not completed landed on a
 * dashboard they could not use and had no route out of.
 *
 * That is not hypothetical: it is exactly what happened to the first real signup, whose
 * confirmation link pointed at `localhost` because the Site URL was never set. The account
 * was confirmed, carried complete metadata, and still had no profile.
 *
 * A guard at the destination survives every entry path — password, a bookmark, a link
 * shared between devices — including the ones added later.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  // getUser(), not getSession(): getSession() believes the cookie, getUser() asks the Auth
  // server whether the token is real.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  // Returns "/dashboard" the moment a profile exists — one indexed lookup on the common
  // path. When there is none it creates one from the signup metadata if that is complete,
  // and otherwise sends them to finish it by hand.
  const destination = await destinationFor(supabase, user);
  if (destination !== "/dashboard") redirect(destination);

  return children;
}
