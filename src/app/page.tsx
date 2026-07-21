import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * There is no marketing page. Everyone who opens this either has an account or is about
 * to make one, so the root sends them to whichever of those is true.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/sign-in");
}
