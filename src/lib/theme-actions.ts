"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { THEME_COOKIE, isTheme } from "@/lib/theme";

export async function setTheme(formData: FormData) {
  const value = formData.get("theme");
  if (!isTheme(value)) return;

  const store = await cookies();

  if (value === "system") {
    // "System" is the absence of a preference, not a third stored value — so choosing it
    // clears the cookie rather than pinning today's system setting forever.
    store.delete(THEME_COOKIE);
  } else {
    store.set(THEME_COOKIE, value, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      // Read by the server on every render to set `data-theme`; no client script needs it,
      // so it does not need to be reachable from JavaScript.
      httpOnly: true,
    });
  }

  // The attribute lives on <html> in the root layout, so the whole tree re-renders.
  revalidatePath("/", "layout");
}
