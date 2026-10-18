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
| Courses this term | 70 offerings (incl. electives PE1 = POPL / RL, PE2 = UI/UX / NN&DL, Honours), 56 linked to an ERP account |
| Timetable | 376 hour-cells this term, with batch / vertical splits; 307 carry their teacher's account |
| Attendance | 5,071 class hours, 275,654 student-hour marks (totals match the Excel registers) |
| Internal marks | 19,908 component marks from the IA workbooks (2025-26 Even, 2026-27 Odd) |
| Academic calendar | 1,005 day entries (first year, II–III, IV scopes) |

## How it is built

- **Next.js 16** (App Router, React, TypeScript, Tailwind) — `src/`.
- **Supabase** — Postgres with row-level security on every table, Supabase Auth,
  private storage buckets. All schema is in `supabase/migrations/` (39 files, applied
  in order; the live database records each in `supabase_migrations.schema_migrations`).
- The browser talks to Supabase directly **as the signed-in person**; rules live in
  the database, so a hidden menu item is never the only protection. Server routes
  (`src/app/api/…`, `src/app/actions.ts`) use the service-role key only after
  re-checking the caller.
- **Attendance Station** (`station/`) — a small Node app the teacher runs on a
  laptop for QR self check-in over the laptop's own Wi-Fi.

### The academic core (migrations 26–39)

| Table | Holds |
| --- | --- |
| `academic_terms` | One row per term; exactly one `is_current`. `start_term()` opens the next one. |
| `calendar_days` | Working day / holiday and which weekday's timetable a day follows, per scope (FY, HS = II–III, IV). |
| `period_slots` | Period timings per term. |
| `subjects` | Course **offerings** per term. Section courses have `section`; combined courses (verticals, electives, honours) have `section = null` + `cohort_grad_year`; alternatives taught in the same hours share an `elective_slot` (PE1, PE2, Honours). Also the CO1–CO6 statements. |
| `subject_faculty` | Teachers of an offering (MAIN / ASSISTANT). |
| `timetable_entries` | One row per class per hour; several rows in one cell = a split hour (`audience` ALL / BATCH / VERTICAL / GROUP). |
| `attendance_sessions` | **One row per class hour**: `roster`, `absent`, `on_duty` (uuid arrays), status, lock time, who took it. Present = on the roster and not absent; on-duty counts as present. |
| `attendance_condonations` | Medical / sports condonation requests (Reg. 7.2), decided by the HOD. |
| `attendance_delegations` | An instructor hands a class to a colleague for given dates. |
| `attendance_pins`, `attendance_devices`, `attendance_self_marks` | Self check-in: PIN (bcrypt), one phone per student, what each phone marked. |
| `pending_staff_links` | People without an account yet; when it is created they take their advisor post and printed courses. |
| `co_po_map`, `assessment_co_map` | CO × PO/PSO correlation (1–3) of a course, and which marks components measure each CO. |
| `marks_publications`, `mark_objections` | A marks component released to students opens a 7-day objection window; objections are answered by the course teacher / HOD. |
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
- **No overwriting**: a save made from a copy older than a colleague's newer save is
  refused ("changed by … — open it again"); during self check-in only the teacher's own
  changes are applied on top of the live check-ins.
- **Substitution**: handing a class over emails the colleague.

### Marks and outcomes (migration 38)

- Marks can be typed or **imported from Excel** one course at a time; the import shows
  unmatched rows, duplicates and out-of-range values before anything is saved.
- **Publishing** a component (Outcomes page) tells students it is final and opens a
  `marks.objection_days` (7) day window; students object from their Marks page and the
  course teacher / HOD answers.
- **CO attainment**: the share of students scoring ≥ `obe.target_percent` (60) in the
  components mapped to the CO → level 3 / 2 / 1 at 70 / 60 / 50 %.
  **PO attainment** = Σ(CO level × correlation) / Σ correlation (direct), combined
  80 / 20 with course-end feedback scaled to 3 (indirect). The HOD's term report is the
  NAAC 2.6.2 / NBA programme-outcome table.

### Settings the HOD can change (Configuration → Attendance rules)

`attendance.lock_minutes` 10 · `min_percent` 75 · `condonation_percent` 65 ·
`backdate_days` 2 · `open_before_minutes` 10 · `self_mark_enabled` on ·
`require_headcount` on · `pin_max_attempts` 5 · `pin_lock_minutes` 15 ·
`qr_rotate_seconds` 10 · `allow_any_staff` off · `alerts.weekly_enabled` on ·
`alerts.parents` on · `alerts.threshold_percent` 80 · `projector_code` off ·
`nav.hidden` (menus per role) · `obe.target_percent` 60 · `obe.level3/2/1_percent`
70/60/50 · `obe.direct_weight` 80 · `marks.objection_days` 7.

### Electives, staff, AI and the desktop app (migrations 41–43)

- **Elective plan** (Configuration → Verticals & groups): per batch, the course each
  vertical takes in PE1–PE6 (R2024 catalogue of the six verticals in `src/lib/verticals.ts`,
  from the approved regulation dated 05.10.2026). *Create this term's elective courses*
  makes the combined offerings; Start next term uses the plan automatically.
- **Add staff** (User Accounts, HOD): paste `Name, email[, department]` lines.
- **LICET AI** (`/api/assistant`, `src/lib/ai/`): an *Ask AI* panel for every role.
  - Looks things up only through the asker's own session (row level security), within a
    daily limit per person (`ai.enabled`, `ai.daily_limit`).
  - **Drafts changes** the person confirms (`lib/ai/actions.ts`): marks of a component,
    attendance of an hour, notices, course outcomes, class hand-over, leave, grievance
    (students); for the HOD also new students / staff, calendar holidays, student record
    corrections and course–teacher links. The confirmed draft is signed (HMAC, 30 minutes,
    tied to the person) and runs with that person's session (`/api/assistant/act`).
  - **Files** (staff): Excel / CSV / Word are turned into text on the server; PDFs and
    pictures go to the model as they are (up to 3 files, 2.5 MB each).
  - **Provider**: `ANTHROPIC_API_KEY` (Claude, `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`)
    or `GEMINI_API_KEY` (`GEMINI_MODEL`, default `gemini-flash-latest`; when a Gemini model is
    busy or rate-limited the next one answers — 2.5 Flash, Flash-Lite, 2.0 Flash, Pro; override
    the list with `GEMINI_FALLBACK_MODELS`); `AI_PROVIDER` picks one when both are set. Provider
    errors are logged as `[assistant]` in the Vercel function logs. Local test: `erp-local-ai` in `.claude/launch.json` with a
    mock model on port 8787; `tests/e2e/ai-actions.mts` checks every kind of draft.
- **Desktop app** (`desktop/`, releases on GitHub): Windows updates itself in the
  background; the Mac app offers new versions. Release: bump `desktop/package.json`
  version, `npm run dist:mac && npm run dist:win`, then
  `gh release create vX.Y.Z desktop/dist/LICET-Things-Staff-* desktop/dist/latest*.yml`.

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
- **Two-step sign-in** (authenticator app): anyone can turn it on in My Profile. Once the
  HOD (or another tier-1 account) has it, the database grants HOD powers only to
  sessions confirmed with the code. Lost phone: `node scripts/reset-two-step.mjs <email>`.
- Grievances are visible only to the student and tier 1. Every role's access is
  checked by `tests/db/06_access_matrix.sql`.
- Supabase security advisor (17 Oct 2026): only expected warnings remain (signed-in
  users may call the API functions, which all check the caller; leaked-password
  protection is the owner's switch).

## Tests

| Command | What |
| --- | --- |
| `npm test` | 270 unit tests (regulations, eligibility, roles, calendar parsing, timetable blocks, marks import) |
| `npm run test:db` | 136 database checks in `tests/db/*.sql` — attendance authority, timing, lock, OD, self check-in, term lifecycle, analysis privacy, staff linking, conflicts, timetable copy, two-step, the full access matrix per role, CO/PO attainment and objections. Each runs in a transaction and rolls back (safe on production). Needs `DATABASE_URL` (psql) or `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`. |
| `npm run test:e2e` | 31 end-to-end checks on the local stack: the Attendance Station from QR to submit, and two-step sign-in. |
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
| Start of term | Configuration → Terms → **Start next term**: promotion (odd term), periods, R2024 courses, elective / vertical courses and the timetable copied from the same term last year, calendar Excel. Then check teachers, elective slots, batches / verticals | Configuration |
| After each assessment | Enter or import marks, then publish the component (7-day objection window) | Assessments & Marks, Outcomes |
| End of term (outcomes) | Map COs → POs and assessments → COs; export CO / PO attainment and the term report | Outcomes (CO–PO) |
| June | Year promotion, then archive graduates | Year Promotion |
| New staff | `node scripts/create-staff.mjs list.json --apply --out <file outside the repo>` (default password `licet@<name>`) | terminal |

## Things only the owner can do

1. **Rotate the Supabase keys** (an old service key is in the repository history) and
   put the new ones in Vercel.
2. Set **`CRON_SECRET`** in Vercel (the weekly alerts route refuses calls without it)
   and confirm `RESEND_API_KEY` / `EMAIL_FROM`.
3. Turn on **leaked-password protection** in Supabase → Authentication.
4. Hand out the default passwords (files in `~/Downloads/CSE_Staff/`, not in the repo)
   and ask everyone to sign in once. The HOD should then turn on two-step sign-in.
5. Raise the minimum password length in Supabase → Authentication (it is 6).
6. For LICET AI: add ONE key to the Vercel environment (and `deploy/.env` on the college
   server): `ANTHROPIC_API_KEY` (console.anthropic.com) or `GEMINI_API_KEY`
   (aistudio.google.com — use a billing-enabled project; Google's free tier may use prompts,
   i.e. student records, to improve its models).
7. Decide the college-server details listed in the runbook (domain, campus-only or
   internet, off-site backup).

Test data from the March–June trials (2 test student accounts, test notices, grievances,
a leave, 29 marks and the old part-wise attendance rows) was removed on 17 Oct 2026; a
copy is in `~/Downloads/CSE_Student_Lists/backups/test_data_removed_2026-10-17.json`.

## Open items

- 10 lateral-entry students have no account yet (25CS023–026, 25CS134–138, 24CS031).
- Seven printed teachers have no account: Ms E Preesha, Rev. Dr. Justine, Mr Rex, Ms J Christina,
  Mr Martin Mahimai Doss, Dr Krishnan, Mr Clinton — their hours can still be taken by
  the class advisor or the HOD.
- **Two accounts for the HOD, on purpose.** `hodcse@` is the HOD *office* account: it
  holds the HOD role and passes to the next HOD. `sharmila.vj@` is Dr. Sharmila VJ's
  personal faculty account and carries her own courses (CS24501, CCS342). Configuration
  → Attendance rules → **Head of Department** names the person (now Dr. Sharmila VJ):
  their courses also appear under the office account's My classes and dashboard, so
  they can teach from either account; HOD powers stay with the office account. When
  the HOD changes: pick the new person there, reset the office account's password and
  two-step for them. Courses are never auto-linked to the office account (migration 40).
- Staff of other departments are marked *Other* (`profiles.home_department`) and are
  left out of the Head of Department list.
- III CSE-A timetable: only Tue P4 and Fri P7 of a lab swap were edited (II CSE-A was
  swapped fully) — check whether the other hours should change too.
- IA workbooks in the source folder are imported (re-imported 18 Oct 2026) **as written**:
  15,858 component marks (153 "AB"), 259 students, 54 offerings, each with the CIA scheme
  read from its sheet (`subjects.cia_scheme`, migration 45; engine `src/lib/cia-scheme.ts`).
  Lab marks kept on the PiC / PIS / DS / DBMS sheets went to their lab courses (CS24221,
  PH24121, CS24321, CS24322). Students were matched by register number first (one III CSE-A student carries
  another student's roll number in the sheets). Checked against each
  sheet's own internal: 1,852 exact, 152 within 1 mark (sheets that round up part-totals),
  63 more: DAA III CSE-B (sheet mixes theory and lab in CIA 2), Engineering Practices lab
  I CSE-A (typed by hand) and about 17 hand-edited cells. Not imported: Soft Skills (sem 3,
  2024–28 batch), Logical Reasoning (CIA-1 only); two listed students who never joined. Backup of the earlier import: `~/Downloads/CSE_Student_Lists/backups/`.
- 9 II-year lateral entries added 18 Oct 2026 (II CSE-A 25CS023–026, II CSE-B 25CS134–138,
  lab batch 2 like earlier laterals, roll numbers as in the attendance register — the IA sheet
  swaps 25CS134/135); their register attendance from 31 Aug is in the class hours. Four
  unused student accounts were removed at the HOD's request.
- Course outcomes and CO–PO matrices are empty until each teacher fills them in.
