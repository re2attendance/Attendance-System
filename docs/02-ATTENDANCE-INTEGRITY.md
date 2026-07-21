# Attendance Integrity — GPS is not the answer

**Status:** proposal, for the Phase 3 decision (build plan §7.2, question 3).
**Date:** 2026-07-21

---

## The uncomfortable part

Browser geolocation is **trivially** spoofable. Not "a determined attacker with
resources" spoofable — Chrome ships a sensor override in DevTools, Android has
mock-location apps that need no root, and a student can find a two-minute video
explaining either. Assume that within a fortnight of launch, at least one student in
the cohort knows this, and that they will tell their friends.

So: **a passing GPS check proves nothing.** If we build the system such that "GPS was
green" means "present", we have built a paper sheet with extra steps, and the first
cohort to work it out gets a better fraud tool than the one we replaced — because now
the cheating is invisible and timestamped as legitimate.

I don't think that means drop GPS. It means **be honest about its job**: GPS is
_friction and evidence_, not proof. It stops the lazy 90%. The controls below stop the
rest.

---

## Where the real trust comes from

Ranked by how much fraud each actually prevents, most effective first.

### 1. Device binding — the single highest-value control

**The attack this system exists to stop is one student marking their absent friends
present.** That attack has a signature GPS can never see and location can never
disprove: **one device, several students.**

Store a salted hash of a device identifier (a first-party cookie/localStorage UUID,
peppered server-side so the stored value isn't reversible). If the same device
submits for two different students in the same session, flag **both** records for the
rep. Optionally hard-block the second.

- Cheap to build, no new dependency.
- Attacks it stops: signing in for friends — the actual threat model.
- Its weakness: a student can clear storage or use a second phone. But that's now
  _deliberate, repeated effort per friend_, not a favour done in three seconds.
- Cost: someone on a shared/borrowed phone gets flagged. That's why it should **flag
  for human review, not auto-reject** — a false flag costs a rep two seconds, a false
  rejection costs a student their attendance record.

**Recommend: adopt for v1.**

### 2. A short, rep-opened attendance window

Rather than attendance being open for the whole lecture, the **course rep taps "open
attendance"** when in the room, and it stays open ~5 minutes.

This is the strongest structural control on the list, because it collapses the window
in which remote signing is even possible, and it means the rep is demonstrably present
and paying attention at the moment submissions arrive. It also fixes something the
current design leaves open: right now a student can submit at any point in a 2-hour
window, and the rep approves later from memory — which is exactly the "was she here?
I think so" judgement that makes the whole thing soft.

Cost: reps must be reliable, and there needs to be a fallback if a rep forgets (admin
or watcher can open it; or it auto-opens at session start after N minutes).

**Recommend: adopt for v1** — but this is a real change to the flow in §7.2, so it
needs your explicit yes.

### 3. Rotating in-room code

A 6-digit code (or QR) shown on the lecturer's screen or the rep's phone, rotating
every ~30 seconds, verified server-side against the same clock. This is what
commercial systems (iClicker, Top Hat) use, and it's meaningfully stronger than GPS
because the secret only exists inside the room, briefly.

Beats GPS spoofing outright. Beaten by a student photographing the code and
WhatsApping it — which is why rotation matters (a stale code fails) and why it pairs
with #1 (the friend still has to submit from their own device).

**Recommend: defer to a Phase 3.5 / v1.1 decision.** It's the best control on the list
but it adds a screen, a display surface, and a dependency on the rep's phone being
visible. Worth doing if fraud actually shows up in the data — and the flags table will
tell us whether it has.

### 4. Server-side GPS validation (keep, but demote)

Everything here happens in the `SECURITY DEFINER` RPC, never the client:

- **Server clock only.** `submitted_at` is `now()` in Postgres. The client's timestamp
  is never read. Lateness is computed server-side against `sessions.starts_at`.
- **Window check.** Reject outright if the session isn't currently open.
- **Distance via PostGIS.** `ST_DWithin` against the geofence, computed server-side.
  The client sends coordinates; it does not send a verdict.
- **Reject implausible accuracy.** Discard `accuracy > ~150m` (useless) — and treat
  suspiciously _perfect_ readings as a soft flag, since real phone GPS indoors is
  rarely better than ~10m.
- **Impossible travel.** If the same student submitted 3km away 8 minutes ago, flag it.
- **Log every rejection.** A student who fails the geofence five times in a row is
  interesting data, whether they're cheating or standing in a GPS dead spot.

### 5. Human approval remains the backstop

The rep's eyes in the room are the only control that actually verifies a body in a
seat. Everything above exists to make the rep's job _possible_ — to turn a list of 60
names into "these 3 need a look."

**This reframes the rep dashboard**: the pending queue should be sorted by suspicion,
not alphabetically, with flags rendered prominently and a "approve all unflagged"
action. Otherwise reps bulk-approve everything within a week and the whole verification
layer becomes decorative. That's a UI concern, but it's a _security_ requirement, and
it should be in the reference designs you send.

---

## What I recommend committing to for v1

| Control                                                     | v1?                                              |
| ----------------------------------------------------------- | ------------------------------------------------ |
| Server-authoritative time, window, distance                 | ✅ yes — non-negotiable                          |
| Device binding → flag, don't block                          | ✅ yes                                           |
| Accuracy floor + impossible-travel flags                    | ✅ yes                                           |
| `attendance_flags` surfaced in a suspicion-sorted rep queue | ✅ yes                                           |
| Rep-opened ~5 minute window                                 | ✅ recommend, needs your approval (changes §7.2) |
| Rotating in-room code                                       | ⏸ defer to v1.1, decide with real data           |
| Treating a green GPS check as proof                         | ❌ never                                         |

## What I recommend telling students

Say plainly, in the UI, that submissions are checked for location, device and timing,
and that anomalies are shown to the course rep. Deterrence is most of the value here,
and it's the honest framing besides — the system doesn't claim to _know_ you were
there, it claims to make lying inconvenient and visible.
