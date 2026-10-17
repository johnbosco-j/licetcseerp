# LICET Things — handover

Department Information System (DIS) of the Department of CSE, LICET. It covers the
department only: there is no Controller of Examinations role, and eligibility lists
are exported for the CoE rather than sent to them.

- Live: https://cseerp.vercel.app (Vercel + Supabase cloud). Moving to the college
  server: see [deploy/RUNBOOK.md](../deploy/RUNBOOK.md).
- Code: https://github.com/johnbosco-j/licetcseerp (public — no secrets or student
  data in it, ever).
- How each role uses it: [USER-GUIDE.md](USER-GUIDE.md).

## State on 17 October 2026

| | |
| --- | --- |
| Students | 516 active, 8 sections, each with lab batch (and vertical in III year) |
| Staff accounts | 72 active (CSE faculty and faculty of other departments who teach CSE classes) |
| Class advisors | all 8 sections |
| Terms | AY 2025-26 Even (complete register imported), AY 2026-27 Odd (current) |
| Courses this term | 70 offerings, 56 linked to an ERP account |
| Timetable | 376 hour-cells this term, with batch / vertical splits |
| Attendance | 5,071 class hours, 275,654 student-hour marks (totals match the Excel registers) |
| Academic calendar | 1,005 day entries (first year, II–III, IV scopes) |

## How it is built

- **Next.js 16** (App Router, React, TypeScript, Tailwind) — `src/`.
- **Supabase** — Postgres with row-level security on every table, Supabase Auth,
  private storage buckets. All schema is in `supabase/migrations/` (35 files, applied
  in order; the live database records each in `supabase_migrations.schema_migrations`).
- The browser talks to Supabase directly **as the signed-in person**; rules live in
  the database, so a hidden menu item is never the only protection. Server routes
  (`src/app/api/…`, `src/app/actions.ts`) use the service-role key only after
  re-checking the caller.
- **Attendance Station** (`station/`) — a small Node app the teacher runs on a
  laptop for QR self check-in over the laptop's own Wi-Fi.

### The academic core (migrations 26–35)

| Table | Holds |
| --- | --- |
| `academic_terms` | One row per term; exactly one `is_current`. `start_term()` opens the next one. |
| `calendar_days` | Working day / holiday and which weekday's timetable a day follows, per scope (FY, HS = II–III, IV). |
| `period_slots` | Period timings per term. |
| `subjects` | Course **offerings** per term. Section courses have `section`; combined courses (verticals, electives) have `section = null` + `cohort_grad_year`. |
| `subject_faculty` | Teachers of an offering (MAIN / ASSISTANT). |
| `timetable_entries` | One row per class per hour; several rows in one cell = a split hour (`audience` ALL / BATCH / VERTICAL / GROUP). |
| `attendance_sessions` | **One row per class hour**: `roster`, `absent`, `on_duty` (uuid arrays), status, lock time, who took it. Present = on the roster and not absent; on-duty counts as present. |
| `attendance_condonations` | Medical / sports condonation requests (Reg. 7.2), decided by the HOD. |
| `attendance_delegations` | An instructor hands a class to a colleague for given dates. |
| `attendance_pins`, `attendance_devices`, `attendance_self_marks` | Self check-in: PIN (bcrypt), one phone per student, what each phone marked. |
| `pending_staff_links` | People without an account yet; when it is created they take their advisor post and printed courses. |
| `app_settings` | Every rule the HOD can change (below). |

Older tables (`day_attendance`, `attendance`, part-wise) are kept read-only for history;
nothing in the app reads them any more except the audit page.

### Attendance rules (all in the database)

- **Who may take an hour** (`att_can_take`): the course's teachers, the teacher on the
  timetable cell, the class advisor, a colleague the instructor delegated to, the HOD.
  `attendance.allow_any_staff` (off) would open it to all staff.
- **When**: from `open_before_minutes` (10) before the period starts; up to
  `backdate_days` (2) days back; the HOD has no limit. Never for a future date.
- **Lock**: a submitted hour can be corrected for `lock_minutes` (10), then only the
  HOD can change it, with a reason that goes to the audit trail. The HOD can also
  unlock it for 30 minutes for the teacher.
- **Self check-in**: today's hours only, open at most 30 minutes, needs the
  teacher's laptop station signed in as that teacher; PIN lockout after 5 wrong tries
  for 15 minutes; one phone per student; the teacher must enter the head count before
  submitting and cannot submit more present than counted.
- **Eligibility** (Reg. 7): rounded % ≥ 75 eligible; 65–74 only with an approved
  medical/sports condonation; < 65 SA. On-duty hours count as attended.
- **Autosave**: an unsubmitted register is saved as a draft 3 s after the last tap and
  also kept in the browser until saved.

### Settings the HOD can change (Configuration → Attendance rules)

`attendance.lock_minutes` 10 · `min_percent` 75 · `condonation_percent` 65 ·
`backdate_days` 2 · `open_before_minutes` 10 · `self_mark_enabled` on ·
`require_headcount` on · `pin_max_attempts` 5 · `pin_lock_minutes` 15 ·
`qr_rotate_seconds` 10 · `allow_any_staff` off · `alerts.weekly_enabled` on ·
`alerts.parents` on · `alerts.threshold_percent` 80 · `nav.hidden` (menus per role).

## Security

- Row-level security on every table; signed-out visitors have no table or function
  access; functions run with a fixed `search_path`; trigger functions cannot be
  called through the API.
- Students read only their own hours (`my_attendance`), never a whole register
  (which would name classmates). Analysis functions (`ana_*`) return nothing to
  students.
- Audit trail on attendance, marks, profiles, courses, condonations and more.
- Graduates are archived (complete records to private storage) and their sign-in is
  blocked; nothing is deleted.
- Default passwords must be changed at first sign-in.

## Tests

| Command | What |
| --- | --- |
| `npm test` | 254 unit tests (regulations, eligibility, roles, calendar parsing, timetable blocks) |
| `npm run test:db` | 63 database tests in `tests/db/*.sql` — attendance authority, timing, lock, OD, self check-in, term lifecycle, privacy of analysis, staff linking. Each runs in a transaction and rolls back. Needs `DATABASE_URL` (psql) or `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`. |
| `npm run build` | Must pass before every push (Vercel builds the same). |

CI (`.github/workflows/ci.yml`) runs the typecheck, the unit tests and the build on every push.

**Local stack** for clicking through safely (never on real data):
`supabase start` (needs Docker/Colima) → `node scripts/seed-local.mjs` with the
local URL and service key → `bash scripts/dev-local.sh` → http://localhost:3100.
Test accounts `hod@test.local`, `faculty1@test.local`, `advisor@test.local`,
`student1@test.local` … (password in `scripts/seed-local.mjs`).

## Routine operations

| When | What | Where |
| --- | --- | --- |
| Each hour | Take attendance | Attendance → Take attendance |
| Each week (automatic, Mon 07:00 IST) | Shortage emails to students below 80% (parents and advisor copied) | `/api/cron/attendance-alerts` |
| End of term | Verify registers (Insights → hours not recorded), export eligibility for the CoE | Attendance → Summary & eligibility |
| Start of term | Configuration → Terms → **Start next term** (copies periods), import the calendar Excel, add courses (or copy from a previous term), link faculty, build timetables, set batches / verticals | Configuration |
| June | Year promotion, then archive graduates | Year Promotion |
| New staff | `node scripts/create-staff.mjs list.json --apply --out <file outside the repo>` (default password `licet@<name>`) | terminal |

## Things only the owner can do

1. **Rotate the Supabase keys** (an old service key is in the repository history) and
   put the new ones in Vercel.
2. Set **`CRON_SECRET`** in Vercel (the weekly alerts route refuses calls without it)
   and confirm `RESEND_API_KEY` / `EMAIL_FROM`.
3. Turn on **leaked-password protection** in Supabase → Authentication.
4. Hand out the default passwords (files in `~/Downloads/CSE_Staff/`, not in the repo)
   and ask everyone to sign in once.
5. Decide the college-server details listed in the runbook (domain, campus-only or
   internet, off-site backup).

## Open items

- 10 lateral-entry students have no account yet (25CS023–026, 25CS134–138, 24CS031).
- Seven printed teachers have no account: Ms E Preesha, Rev. Dr. Justine, Mr Rex,
  Ms J Christina, Mr Martin Mahimai Doss, Dr Krishnan, Mr Clinton — their hours can
  still be taken by the class advisor or the HOD.
- "Ms A Jerlin" (CS24311, II CSE-B) was linked to the *aruljerlin* account by name;
  confirm it is the same person.
- Duplicate account "Dr. Sharmila VJ Member" (sharmila.vj@) should be merged or
  removed.
- III CSE-A timetable: only Tue P4 and Fri P7 of a lab swap were edited (II CSE-A was
  swapped fully) — check whether the other hours should change too.
- Internal-assessment marks from the IA workbooks are not imported (layouts and
  course codes differ between sheets); CO–PO attainment is not built yet.
