"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";

/**
 * The fast path, and the one that proves identity best.
 *
 * upsamail.edu.gh runs on Google Workspace, so Google returning the address *is* proof
 * the student owns it — stronger than a confirmation link, which only proves someone
 * read the inbox once (D-064).
 *
 * `hd` restricts the account chooser to the university domain. It is a convenience, not
 * a control: it can be stripped from the request, so the callback checks the returned
 * address again server-side before trusting it.
 */
export function GoogleButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN, prompt: "select_account" },
      },
    });

    // Reached only if the redirect never happens; on success the page is already gone.
    if (error) {
      setError("Could not reach Google. Try again, or use your index number below.");
      setBusy(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" busy={busy} onClick={start}>
        <GoogleMark />
        {label}
      </Button>
      {error ? (
        <p role="status" aria-live="polite" className="text-danger mt-2 text-[0.8125rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.2-3.8 6.6-9.5 6.6-15.7"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.900l-.3.1-6.7 5.2-.1.3C7.9 40.9 15.4 46 24 46"
      />
      <path
        fill="#FBBC05"
        d="M11.5 27.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6v-.3l-6.8-5.3-.2.1a22 22 0 0 0 0 20.2z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.3 29.9 1 24 1 15.4 1 7.9 6.1 4.5 13.5l7 5.4C13.3 13.3 18.2 9.5 24 9.5"
      />
    </svg>
  );
}
