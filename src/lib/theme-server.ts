import "server-only";

import { cookies } from "next/headers";

import { THEME_COOKIE, isTheme, type Theme } from "@/lib/theme";

/**
 * The stored preference, or "system" when there is none.
 *
 * Read on the server and written onto `<html data-theme>` before anything paints. Doing it
 * on the client is where the flash of the wrong theme comes from: the page renders light,
 * a script runs, and the screen snaps to dark — worst at night, which is exactly when
 * someone has dark mode on.
 *
 * A cookie rather than the database, deliberately. It works before a profile exists (both
 * signup routes pass through several screens first), it survives sign-out, and a display
 * preference is not attendance data — it does not belong in a table protected by RLS. The
 * trade is that it does not follow the student to a second device, which is the right
 * trade for something they can re-pick in one tap.
 */
export async function readTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "system";
}
