import { redirect } from "next/navigation";

import { homePathFor } from "@/lib/auth/guards";
import { getUser } from "@/lib/auth/session";

/**
 * The root is a switchboard, not a page.
 *
 * §11.9 names a hero section on a dashboard as an anti-tell, and there is
 * nothing to say here that is worth a tap: someone opening this app wants to
 * report present, or work a queue. Send them there.
 *
 * homePathFor() orders by authority, so a rep — who is also a student (§4) —
 * lands on the queue. Reporting their own attendance is two taps from anywhere.
 */
export default async function RootPage() {
  const user = await getUser();
  redirect(user ? homePathFor(user) : "/login");
}
