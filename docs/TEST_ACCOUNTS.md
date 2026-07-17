# Test accounts

Created by `pnpm db:reset`. **Local development only** — `supabase/seeds/` never runs against a deployed database, and these credentials exist nowhere else.

Password for every account: `password123`

| Role | Email | Who they are |
|---|---|---|
| Admin | `admin@uoa.edu.gh` | Ama Darko. Global admin — everything, including the audit log. |
| Instructor | `k.mensah@uoa.edu.gh` | Dr Kwame Mensah. Owns sections 1, 4, 7, 10 (CSC). The busiest instructor. |
| Instructor | `a.owusu@uoa.edu.gh` | Dr Akosua Owusu. Owns sections 2, 5, 8, 11 (MTH). |
| Instructor | `y.asante@uoa.edu.gh` | Dr Yaw Asante. Owns sections 3, 6, 9, 12 (EEE). |
| Student | `student1@st.uoa.edu.gh` … `student300@st.uoa.edu.gh` | 300 students, matric `CSC/2021/0001`–`CSC/2021/0300`. |

## The accounts that matter

The list above is furniture. These are the ones that exist to prove something:

| Case | Who | Why they exist |
|---|---|---|
| **Rep who is also a student** | The lowest-UUID enrolled student in each of sections 1–12 | §4's core claim: a rep IS a student with a scoped grant, and permissions are additive, not a single enum. This person has both roles at once and the whole permission model has to cope. |
| **Co-rep** | Second rep on section 1 | Proves multiple reps per section, and is the person who can legitimately approve the primary rep's own attendance under the conflict-of-interest rule. |
| **Expired rep** | A student on section 2 | Has a `course_rep_assignments` row whose `ends_at` passed 4 weeks ago. The row exists; the authority does not. If this account can still approve anything, the appointment period is decorative. |
| **Low-attendance student** | `student300@st.uoa.edu.gh` (Kojo Gyasi, `CSC/2021/0300`) | ~55% — deliberately below the 75% threshold, so the eligibility report and the low-attendance warning job have a real subject rather than an empty list. |
| **Withdrawn student** | `student297@st.uoa.edu.gh` | `status = 'withdrawn'`. Every list, filter and export has to cope with them. |
| **Suspended student** | `student298@st.uoa.edu.gh` | `status = 'suspended'`. |
| **Graduated student** | `student299@st.uoa.edu.gh` | `status = 'graduated'`. |

To find the rep for a section:

```sql
select p.full_name, p.email, a.class_section_id, a.starts_at, a.ends_at, a.revoked_at
from course_rep_assignments a
join profiles p on p.id = a.user_id
order by a.class_section_id, a.starts_at;
```

## What the seed puts on screen

§13: "Seeds must exercise every status and every dashboard chart — a seed that produces empty dashboards is useless."

- **300 students · 20 sections · 1,149 enrollments · 9,400 records** across an 8-week term in progress.
- **All ten statuses** populated, weighted like a real cohort: ~5,700 present, ~1,300 late, ~1,200 absent, plus rejected, excused, permission_granted, cancelled and both pending states.
- **3 sessions open right now**, staggered so the Today screen shows one inside the present window, one already into the late window, and one that just started — the three states the live session card must render, visible at once.
- **A live verification queue** with ~150 pending requests waiting, oldest-first.
- **A shared-device flag** on section 1's open session: two students submitting from one fingerprint. Flagged, never auto-blocked (§7).
- **333 students below the 75% threshold**, so the eligibility report and low-attendance charts have content.
- **3 disputes** — one open, one responded, one resolved with an instructor override attached.
- **A cancelled session and its makeup**, so the "excluded from the denominator" path is real.
- **A finalized past semester**, whose records are locked permanently (§6.6).

## Notes

- Passwords are bcrypt-hashed in the seed, and these accounts **genuinely authenticate** — verified in Phase 3 by logging in for real and watching a live JWT hit live RLS.

  That sentence used to be a prediction, and it was wrong. As shipped in Phase 2, **not one of the 304 accounts could log in**: the seed wrote `auth.users` rows with NULL in `confirmation_token` and friends, GoTrue scans those into non-nullable Go strings, and every login died with a 500 blaming "Database error querying schema". The columns are nullable in the schema, so Postgres accepted the rows happily — Postgres and GoTrue disagree about what a valid user is, and only one of them is consulted at INSERT time.

  Nothing caught it, because nothing tried: Phase 2 had no login, and the pgTAP suite sets `request.jwt.claims` directly and never goes through GoTrue. 104 RLS tests passed against accounts that could not authenticate. Fixed in `supabase/seeds/00_helpers.sql`, which now explains why the empty strings are there.
- The seed is **deterministic** — every "random" choice is a hash of stable inputs, so a reset reproduces the same database. A seed that differs run to run makes a failing test a coin toss.
- Inbucket/Mailpit catches all outbound mail locally at http://127.0.0.1:54324.
