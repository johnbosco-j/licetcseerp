# LICET Things — how to use it

Sign in at https://cseerp.vercel.app with your licet.ac.in email. The first time, you
must choose your own password (staff default: `licet@` + your name in lower case
without titles or initials, e.g. `licet@kavitha`; students: as told by the class
advisor). Forgotten password: ask your class advisor, a password admin or the HOD.

## Faculty

**Take attendance** — Attendance → *Take attendance*.

1. *My classes* lists today's hours from your timetable (a 2–3 hour lab is one item).
   Use the arrows to go back up to 2 days.
2. Open an hour. Everyone starts **Present**; tap a name to make it **Absent**. Tap
   **OD** for a student present on duty (counts as attended).
3. Add the topic covered if you like, then **Submit**. You can correct it for
   10 minutes; after that it locks and only the HOD can change it.
4. Until you submit, your marks are saved as a draft automatically — closing the page
   loses nothing.

A split hour (batch 1 in one lab, batch 2 in another; or a vertical course taught to
both sections together) shows only your students.

**Cannot take a class?** *Hand over my class* gives one of your hours to a colleague
for chosen dates; they get an email and see it under My classes. If you see "You are not the course instructor…", ask the instructor
to hand it over, or the HOD to link you to the course.

**Self check-in (QR)** — for today's class: open the hour → *Self check-in*, start the
Attendance Station on your laptop (see `station/README.md`), show the QR code. Students
join the laptop's Wi-Fi, scan, and enter their register number and PIN; they turn
present live. Count the students in the room, enter the **head count**, review, submit.

**Register / Summary** — the full register of a class and course with Excel export;
Summary shows each student's % and eligibility.

**Marks** — Assessments & Marks: pick the term, class and course (elective options such
as *PE1 · POPL* are listed too). Each course follows its **assessment scheme** — the same
split as the department's IA sheets: per CIA a CT (out of 30, counts 20), CAT (out of 60
or 100, counts 40), ABA / assignment (out of 40, counts 40); lab-integrated courses add lab
performance /75 and practical test /25 with the theory / lab split (e.g. 30 + 20, 25 + 25);
labs LP /75 + test /25 → 60. Type marks as written in the sheet, **AB** for absent; the
*Special test* tab takes the SP mark, which replaces an absent CAT. *Summary* shows the
internal, SEE, total and grade. The course's teachers (and the HOD) can change the scheme on
the *Assessment scheme* tab — out of, weight, which marks are added together (pool),
rounding — when a sheet is laid out differently. **Import from Excel** maps the sheet's
columns (CT1, CAT2, ABA1, LP, PT1, SP …) onto the scheme. When a component is final,
publish it on the Outcomes page — students then have 7 days to object, and you answer there.

**Outcomes (CO–PO)** — for each of your courses: write CO1–CO6, fill the CO–PO matrix
(1/2/3), tick which assessments measure each CO. Attainment is calculated from the marks
and the course feedback; export it to Excel for the course file.

## Class advisors

Everything faculty do, plus:

- take any hour of your section (a colleague is absent),
- *Condonation* tab: requests from your students (the HOD decides),
- *Insights* for your section, password resets for your students (User Accounts — your own
  class only),
- weekly shortage emails copy you.

## Administrators (non-teaching)

Add and correct **students** (Student Records → Add / Import from Excel), **courses**
(Courses → Manage & allot) and **staff accounts** (User Accounts → Add staff), and reset
students' and faculty passwords. Administrators do not see marks, attendance or the timetable,
and cannot make anyone HOD, tier 1 or an administrator — only the HOD sets tiers (User
Accounts → Tier). A faculty member can be given administrator powers on top of teaching
(*Faculty + administrator*).

## Lab instructors

*Attendance → Lab hours today* lists the lab hours of every class. A lab hour can be marked
on the day, from a few minutes before it starts until 15 minutes after it ends — not other
hours, past days or marks. Whether an hour is a lab hour comes from the timetable (lab courses,
batch-split hours and lab blocks); the HOD can correct it.

## Students

- **Attendance** — your hours, course by course and day by day, your % and how many
  hours in a row you need to reach 75%. On-duty hours count as attended.
- **Attendance PIN** — set a 4–6 digit PIN for self check-in. The first phone you use
  becomes your registered phone; your class advisor can reset it.
- **Condonation** — if you missed classes for medical reasons or a sports event,
  request condonation with the certificate attached (65–74% only; Reg. 7.2).
- Below 80% you get a weekly email (your parents and class advisor are copied).
- **Courses** lists your own elective options (e.g. *PE1 · RL* for AI & ML, *PE1 · POPL*
  for Full Stack). Give course feedback for every course, electives included.
- **Marks objections** — when a teacher publishes a component, your Marks page shows it
  with *Object* for 7 days. Say what is wrong; the teacher's answer appears there.

## HOD

- **Dashboard** — today's hours per section (green = taken, amber = started but not
  taken), students below 75%, pending requests, faculty workload.
- **Insights** — every analysis, all exportable to Excel: class KPIs, weekly trend,
  hours on the timetable but not recorded, faculty scheduled vs recorded, students who
  fell below 75% in the last two weeks, absence streaks, course × class heat map,
  absence by weekday × period, batch / vertical comparison, the same batch across
  terms, and a custom report (pick classes, course, dates, grouping). Choose any past
  term at the top.
- **Attendance** — any hour, any date; correct a locked hour with a reason, or unlock
  it for the teacher for 30 minutes. *Condonation* tab: approve or reject.
- **Configuration**
  - *Terms, calendar & periods* — start the next term, import the academic calendar
    Excel, edit period timings, mark holidays or a Saturday that follows a weekday.
  - *Courses & faculty* — add courses (or from the R2024 curriculum, or copy from a
    previous term), combined courses for verticals / honours, link teachers.
  - *Timetable* — opens the timetable editor: Edit → click an hour → course, teacher,
    room, split by batch / vertical / group, or "no attendance" (e.g. mentoring).
    *Whole block* applies the change to every hour of a lab.
  - *Students, batches & advisors* — class advisor, lab batch split by register
    number, verticals.
  - *Verticals & groups*, *Attendance rules* (lock minutes, minimum %, back-dating…),
    *Menus* (hide a module from faculty or students), *Data editor* (any record, with
    audit trail).
- **Year Promotion** (June) and **archive graduates**; **Audit Trail**; **Data Export**.
- **Outcomes (CO–PO)** — every course, plus the *Programme outcome attainment* of the
  term (NAAC 2.6.2 / NBA) with Excel export.
- **Two-step sign-in** — turn it on in My Profile (authenticator app). After that, HOD
  powers need the 6-digit code at each sign-in.
- **Start next term** also copies last year's elective / vertical courses and timetable
  for the same semester; review teachers and *elective slots* (Configuration → Courses).
- **Attendance rules** — includes the optional 2-digit projector code for self check-in.

## LICET AI (everyone)

*Ask AI* (bottom right) answers from the ERP with your own access — attendance, timetable,
marks, notices, calendar, how to do something. It can also **do** things for you: it
prepares a draft (e.g. "mark 24CS005 and 24CS017 absent for my class now", "enter these
CIA 1 CAT marks", "apply for medical leave tomorrow", "hand over my class on Friday to
Dr. X") and shows it with **Confirm**. Nothing is saved until you press Confirm; check the
names and figures first.

Staff can attach a file with the paper clip — an Excel or CSV sheet, a Word document, a PDF
or a photo of a marks list (up to 3 files, 2.5 MB each) — and say what to fill in. The HOD
can also add students and staff, declare holidays, correct a student's record and link
teachers to courses this way. For a whole IA workbook, Assessments & Marks → Import from
Excel is still the quickest.

## Excel downloads (department formats)

- **Attendance → Register → Excel**: the department register (as in CSE.xlsx) — a block per
  week, each day's date and day order over its periods, 1 present / 0 absent / 2 on duty, total
  hours present / on duty / worked and %, and the absentee count per hour.
- **Assessments & Marks → Export XLSX**: the course in the IA workbook format — Namelist, the
  course sheet (CT, CAT, ABA … as written, scaled columns, CIA totals, SP, total internal,
  internal, all as Excel formulas) and the CIA-I / CIA-II upload sheets (Format No. 16a).
  **Class IA workbook** (HOD and class advisors) puts every course of the class in one workbook.
- **Class Timetable → Excel**: the class timetable in Format No. 8a.
