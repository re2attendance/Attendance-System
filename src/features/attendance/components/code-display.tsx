"use client";

import { useEffect, useState } from "react";

import { rotateSessionCode } from "../actions";

/**
 * The code the rep projects for the room. It rotates every 30 seconds server-
 * side (rotate_session_code, 0018); this polls it, shows the current code big,
 * and counts down to the next rotation so the room can see it is live.
 *
 * The yellow ring is one of yellow's five sanctioned uses (§5): the session-code
 * ring. Nothing else on this screen is yellow.
 *
 * The code is fetched, never received over Realtime — a change payload would
 * stream it to every subscriber, students included (see 0018). Only a section
 * administrator can call the rotate function, and this component only renders on
 * a page already gated to them.
 */
export function CodeDisplay({
  sessionId,
  classSectionId,
}: {
  sessionId: string;
  classSectionId: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      const res = await rotateSessionCode({ sessionId, classSectionId });
      if (!active) return;
      if (res?.data) {
        setCode(res.data.code);
        setSeconds(res.data.secondsRemaining);
        setFailed(false);
      } else {
        setFailed(true);
      }
    }

    poll();
    // Poll faster than the 30s rotation so the displayed code is never stale and
    // the countdown stays honest. The function only actually rotates when due.
    const id = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [sessionId, classSectionId]);

  return (
    <div className="flex items-center gap-4 rounded-card border border-line p-4">
      <div
        className="flex size-24 shrink-0 items-center justify-center rounded-full border-2 border-primary"
        aria-hidden="true"
      >
        <span className="font-mono text-12 text-mute" data-numeric>
          {seconds !== null ? `${seconds}s` : "—"}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-13 text-mute">Attendance code — read it out or project it</p>
        <p
          className="font-mono text-32 font-semibold tracking-[0.25em] text-ink"
          data-numeric
          aria-live="polite"
        >
          {failed ? "unavailable" : (code ?? "······")}
        </p>
        <p className="text-12 text-mute">Rotates every 30 seconds.</p>
      </div>
    </div>
  );
}
