# LICET CSE ERP

Department ERP for the Department of Computer Science & Engineering, Loyola-ICAM College of Engineering and Technology (LICET), Chennai. The UI follows the licet.ac.in design: indigo `#1A0C4E`, gold `#DCCAA0`, cream `#F3E5C4`, Cormorant Garamond headings and DM Sans text.

Stack: Next.js (App Router) + Supabase (Postgres, Auth, Storage, Row Level Security) + Resend for email.

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Create a Supabase project** at supabase.com, then copy `.env.example` to `.env.local` and fill in the URL, anon key and service-role key (Project Settings → API).

3. **Create the database** (needs the Supabase CLI):

   ```bash
   supabase link --project-ref <your-project-ref>
   npm run db:push
   ```

   This applies everything in `supabase/migrations`: tables, storage buckets and the role-based access rules.

4. **Create accounts and subjects**

   ```bash
   npm run seed
   npm run seed:subjects
   npm run seed:first-years -- scripts/data/first-years-2026-27.json --apply
   npm run db:verify
   ```

   Student lists in `scripts/data/` are personal data and are not committed.

5. **Run**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and sign in with a seeded account.

## Roles and access

Access is enforced in the database (RLS), not just in the UI:

| Role | Can do |
| --- | --- |
| HOD | Everything: students, subjects, locks, leave approval, finance, promotion, appraisal results |
| Faculty (`PROFESSOR`) | Mark attendance and enter marks (unless the HOD has locked the subject/section), post notices, events and documents |
| Student | Read their own attendance, marks, alerts and section timetable; apply for leave; raise grievances; submit feedback (once per subject), surveys and appraisals |

### Passwords

- Default student password: email local part without dots + `@licet` (e.g. `lithika.30csb@licet.ac.in` → `lithika30csb@licet`).
- Anyone with a default or reset password must set a new one at their next sign-in before using the ERP.
- **Accounts** page: students' passwords can be reset by the HOD, a password admin (set by the HOD; currently Dr. Remegius Praveen L) or the class advisor of their section; faculty passwords by the HOD or a password admin. The HOD assigns class advisors there.
- Resets and account creation run as server actions that re-check these rules with the service-role key.

### Regulations 2024

`src/lib/regulations.ts` holds the B.E. CSE R2024 curriculum (L-T-P-C, course type) and the rules from the LICET Regulations 2024 and Examination Policy used everywhere in the app: CIA/SEE split (Table 5), internal-mark formulas (Tables 6–9), pass requirement (≥ 50% total with ≥ 45% in both CIA and SEE, clause 12), letter grades (Table 14), GPA/CGPA (clause 14) and attendance eligibility (≥ 75%, 65–74% with condonation, < 65% SA, clause 7).

### Audit trail

Every change to marks, attendance, profiles, subjects, locks, finance, leaves, grievances, promotion and more is written to an append-only `audit_log` (who, when, IP, old/new values). The HOD sees it under **Audit Log**, with changes to existing marks flagged (Examination Policy §16.2). Faculty can only enter marks/attendance for subjects allotted to them (or unallotted ones).

## Email notifications

Set `RESEND_API_KEY` and `EMAIL_FROM` (an address on a domain verified in Resend) to send:

- absence-without-information alerts when attendance is saved,
- leave approval/rejection emails,
- grievance status updates.

`/api/send-email` only accepts requests from signed-in staff.

## Scripts

Scripts in `scripts/` read `.env.local`; run them from the project root. Never hard-code keys in them.
