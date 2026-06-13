#!/usr/bin/env bash
# ============================================================
# Excelsior ERP — Auto Email Notifications Setup
# Run from your project root:
#   cd ~/Documents/Excelsior/web
#   bash setup-notifications.sh
# ============================================================

set -e  # stop on first error

PROJECT="$HOME/Documents/Excelsior/web"
cd "$PROJECT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Excelsior ERP — Notification Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── STEP 1: Fix the security leak ────────────────────────────
# NEXT_PUBLIC_ prefix exposes the Resend key to the browser.
# We rename it to RESEND_API_KEY (server-only) and move the
# actual send call into a Next.js API route.
echo "▶ Step 1 — Fixing Resend key security (removing NEXT_PUBLIC prefix)"

# 1a. Rename the env var in .env.local
if [ -f .env.local ]; then
  sed -i '' 's/NEXT_PUBLIC_RESEND_API_KEY/RESEND_API_KEY/' .env.local
  echo "  ✓ Renamed key in .env.local"
else
  echo "  ⚠ No .env.local found — create it with: RESEND_API_KEY=re_xxxxxxxx"
fi

# 1b. Update email.ts to use server-side env var
cat > src/lib/email.ts << 'EMAILTS'
// Email service — Resend API
// Key is server-only (no NEXT_PUBLIC prefix) — never exposed to browser.
// Call sendEmail() only from:
//   - Next.js API routes  (/app/api/*)
//   - Server Components   (async components without "use client")
// From the client, POST to /api/send-email instead.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const FROM_EMAIL     = 'Excelsior ERP <onboarding@resend.dev>'
const HOD_EMAIL      = 'hodcse@licet.ac.in'

export interface EmailPayload {
  to:      string | string[]
  subject: string
  html:    string
}

export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { success: false, error: 'RESEND_API_KEY not set' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
      })
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.message ?? 'Send failed' }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// ── Email Templates ──────────────────────────────────────────────────────────

export const emailTemplates = {

  attendanceAlert: (studentName: string, section: string, date: string, missedParts: string[]) => ({
    subject: `Attendance Alert — ${studentName} — ${date}`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
  <div style="background:#1a1a2e;padding:16px 20px;border-radius:6px 6px 0 0;margin:-20px -20px 20px">
    <h1 style="color:#fff;margin:0;font-size:18px">Excelsior ERP — LICET CSE</h1>
    <p style="color:#aaa;margin:4px 0 0;font-size:12px">Automated Attendance Alert</p>
  </div>
  <p style="color:#333;font-size:14px">Dear <strong>${studentName}</strong>,</p>
  <p style="color:#333;font-size:14px">This is to inform you that your attendance was marked <strong style="color:#d32f2f">ABSENT</strong> for the following session(s) on <strong>${date}</strong>:</p>
  <div style="background:#fff3f3;border-left:4px solid #d32f2f;padding:12px 16px;margin:16px 0;border-radius:4px">
    ${missedParts.map(p => `<p style="margin:4px 0;color:#d32f2f;font-size:14px">• ${p}</p>`).join('')}
  </div>
  <p style="color:#333;font-size:14px">You are requested to <strong>meet Dr. Sharmila V J, Head of Department — CSE</strong> at the earliest to clarify your absence.</p>
  <div style="background:#f5f5f5;padding:12px 16px;border-radius:4px;margin:16px 0">
    <p style="margin:0;color:#555;font-size:13px"><strong>Section:</strong> ${section}</p>
    <p style="margin:4px 0 0;color:#555;font-size:13px"><strong>Date:</strong> ${date}</p>
    <p style="margin:4px 0 0;color:#555;font-size:13px"><strong>Action Required:</strong> Meet HoD and get signature</p>
  </div>
  <p style="color:#888;font-size:12px;margin-top:20px">This is an automated message from Excelsior ERP — LICET Department of CSE.<br>Please do not reply to this email.</p>
</div>`
  }),

  leaveDecision: (studentName: string, status: 'APPROVED' | 'REJECTED', leaveType: string, fromDate: string, toDate: string, note?: string) => ({
    subject: `Leave ${status} — ${leaveType}`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
  <div style="background:#1a1a2e;padding:16px 20px;border-radius:6px 6px 0 0;margin:-20px -20px 20px">
    <h1 style="color:#fff;margin:0;font-size:18px">Excelsior ERP — LICET CSE</h1>
    <p style="color:#aaa;margin:4px 0 0;font-size:12px">Leave Application Update</p>
  </div>
  <p style="color:#333;font-size:14px">Dear <strong>${studentName}</strong>,</p>
  <p style="color:#333;font-size:14px">Your leave application has been <strong style="color:${status === 'APPROVED' ? '#2e7d32' : '#d32f2f'}">${status}</strong>.</p>
  <div style="background:${status === 'APPROVED' ? '#f1f8e9' : '#fff3f3'};border-left:4px solid ${status === 'APPROVED' ? '#2e7d32' : '#d32f2f'};padding:12px 16px;margin:16px 0;border-radius:4px">
    <p style="margin:0;font-size:14px"><strong>Type:</strong> ${leaveType}</p>
    <p style="margin:4px 0 0;font-size:14px"><strong>From:</strong> ${fromDate}</p>
    <p style="margin:4px 0 0;font-size:14px"><strong>To:</strong> ${toDate}</p>
    ${note ? `<p style="margin:4px 0 0;font-size:14px"><strong>Note:</strong> ${note}</p>` : ''}
  </div>
  <p style="color:#888;font-size:12px;margin-top:20px">This is an automated message from Excelsior ERP — LICET Department of CSE.</p>
</div>`
  }),

  grievanceUpdate: (studentName: string, subject: string, status: string, resolution?: string) => ({
    subject: `Grievance Update — ${status}`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
  <div style="background:#1a1a2e;padding:16px 20px;border-radius:6px 6px 0 0;margin:-20px -20px 20px">
    <h1 style="color:#fff;margin:0;font-size:18px">Excelsior ERP — LICET CSE</h1>
    <p style="color:#aaa;margin:4px 0 0;font-size:12px">Grievance Status Update</p>
  </div>
  <p style="color:#333;font-size:14px">Dear <strong>${studentName}</strong>,</p>
  <p style="color:#333;font-size:14px">Your grievance "<strong>${subject}</strong>" has been updated to <strong>${status}</strong>.</p>
  ${resolution ? `<div style="background:#f5f5f5;padding:12px 16px;border-radius:4px;margin:16px 0"><p style="margin:0;font-size:14px"><strong>Resolution:</strong> ${resolution}</p></div>` : ''}
  <p style="color:#888;font-size:12px;margin-top:20px">This is an automated message from Excelsior ERP — LICET Department of CSE.</p>
</div>`
  }),

  examSchedule: (studentName: string, exams: {subject: string; date: string; time: string; venue: string}[]) => ({
    subject: `Exam Schedule — ${exams.length} exam(s) scheduled`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
  <div style="background:#1a1a2e;padding:16px 20px;border-radius:6px 6px 0 0;margin:-20px -20px 20px">
    <h1 style="color:#fff;margin:0;font-size:18px">Excelsior ERP — LICET CSE</h1>
    <p style="color:#aaa;margin:4px 0 0;font-size:12px">Exam Schedule Notification</p>
  </div>
  <p style="color:#333;font-size:14px">Dear <strong>${studentName}</strong>,</p>
  <p style="color:#333;font-size:14px">The following exam(s) have been scheduled:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
    <tr style="background:#1a1a2e;color:#fff">
      <th style="padding:8px 12px;text-align:left">Subject</th>
      <th style="padding:8px 12px;text-align:left">Date</th>
      <th style="padding:8px 12px;text-align:left">Time</th>
      <th style="padding:8px 12px;text-align:left">Venue</th>
    </tr>
    ${exams.map((e, i) => `
    <tr style="background:${i%2===0?'#f9f9f9':'#fff'}">
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${e.subject}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${e.date}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${e.time}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${e.venue}</td>
    </tr>`).join('')}
  </table>
  <p style="color:#888;font-size:12px;margin-top:20px">This is an automated message from Excelsior ERP — LICET Department of CSE.</p>
</div>`
  }),

  meetingReminder: (facultyName: string, meetingTitle: string, time: string, venue: string) => ({
    subject: `Meeting Reminder — ${meetingTitle}`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
  <div style="background:#1a1a2e;padding:16px 20px;border-radius:6px 6px 0 0;margin:-20px -20px 20px">
    <h1 style="color:#fff;margin:0;font-size:18px">Excelsior ERP — LICET CSE</h1>
    <p style="color:#aaa;margin:4px 0 0;font-size:12px">Meeting Reminder</p>
  </div>
  <p style="color:#333;font-size:14px">Dear <strong>${facultyName}</strong>,</p>
  <p style="color:#333;font-size:14px">This is a reminder for the upcoming meeting:</p>
  <div style="background:#e8f0fe;border-left:4px solid #1a73e8;padding:12px 16px;margin:16px 0;border-radius:4px">
    <p style="margin:0;font-size:15px;font-weight:bold">${meetingTitle}</p>
    <p style="margin:4px 0 0;font-size:14px">Time: ${time}</p>
    <p style="margin:4px 0 0;font-size:14px">Venue: ${venue}</p>
  </div>
  <p style="color:#888;font-size:12px;margin-top:20px">This is an automated message from Excelsior ERP — LICET Department of CSE.</p>
</div>`
  }),
}
EMAILTS
echo "  ✓ src/lib/email.ts updated (key is now server-only)"


# ── STEP 2: Create the API route ─────────────────────────────
echo ""
echo "▶ Step 2 — Creating /api/send-email route"

mkdir -p src/app/api/send-email

cat > src/app/api/send-email/route.ts << 'APIROUTE'
// /app/api/send-email/route.ts
// Server-side proxy — keeps RESEND_API_KEY off the browser.
// Client components POST here; this calls sendEmail() with the server key.

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { to, subject, html } = body

    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'Missing fields: to, subject, html' }, { status: 400 })
    }

    const result = await sendEmail({ to, subject, html })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
APIROUTE
echo "  ✓ src/app/api/send-email/route.ts created"


# ── STEP 3: Create a client-safe sendEmail helper ─────────────
echo ""
echo "▶ Step 3 — Creating client-side email sender (calls the API route)"

cat > src/lib/send-notification.ts << 'CLIENTSEND'
// send-notification.ts
// Use this in "use client" components instead of importing email.ts directly.
// Sends a POST to /api/send-email which holds the server-side Resend key.

import { emailTemplates } from './email'

type EmailPayload = { to: string; subject: string; html: string }

async function postEmail(payload: EmailPayload): Promise<{ success: boolean }> {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { success: res.ok }
}

export async function notifyAttendanceAbsent(
  studentEmail: string,
  studentName: string,
  section: string,
  date: string,
  missedParts: string[]
) {
  const tmpl = emailTemplates.attendanceAlert(studentName, section, date, missedParts)
  return postEmail({ to: studentEmail, ...tmpl })
}

export async function notifyLeaveDecision(
  studentEmail: string,
  studentName: string,
  status: 'APPROVED' | 'REJECTED',
  leaveType: string,
  fromDate: string,
  toDate: string,
  note?: string
) {
  const tmpl = emailTemplates.leaveDecision(studentName, status, leaveType, fromDate, toDate, note)
  return postEmail({ to: studentEmail, ...tmpl })
}

export async function notifyGrievanceUpdate(
  studentEmail: string,
  studentName: string,
  subject: string,
  status: string,
  resolution?: string
) {
  const tmpl = emailTemplates.grievanceUpdate(studentName, subject, status, resolution)
  return postEmail({ to: studentEmail, ...tmpl })
}
CLIENTSEND
echo "  ✓ src/lib/send-notification.ts created"


# ── STEP 4: Patch attendance-module.tsx ──────────────────────
echo ""
echo "▶ Step 4 — Patching attendance-module.tsx to auto-send alerts"

# Add import for the new notifier (after existing imports)
sed -i '' 's|import { Save, Loader2, Calendar, Download, Lock, Unlock, Clock } from "lucide-react"|import { Save, Loader2, Calendar, Download, Lock, Unlock, Clock } from "lucide-react"\nimport { notifyAttendanceAbsent } from "@/lib/send-notification"|' \
  src/components/modules/attendance-module.tsx

# Insert the notification call right after the setSaveMsg line inside saveDayAttendance.
# We append it after "setSaveMsg(`✓ Part ${activePart} attendance saved · Subjects auto-updated`)"
# using a Python heredoc-free approach with a temp patch file.

python3 << 'PYEOF'
import re

path = "src/components/modules/attendance-module.tsx"
with open(path, "r") as f:
    src = f.read()

PART_LABELS_BLOCK = """
  const PART_LABELS: Record<number, string> = {
    1: 'Part I (8:00 AM — P1, P2)',
    2: 'Part II (10:10 AM — P3, P4, P5)',
    3: 'Part III (1:30 PM — P6, P7, P8)',
  }
"""

NOTIFY_BLOCK = """
    // ── Auto email alert for absent students ──────────────────
    const PART_LABEL: Record<number, string> = {
      1: 'Part I (8:00 AM — P1, P2)',
      2: 'Part II (10:10 AM — P3, P4, P5)',
      3: 'Part III (1:30 PM — P6, P7, P8)',
    }
    const absentStudents = students.filter(s => (dayAttendance[s.id]?.[activePart] ?? 'PRESENT') === 'ABSENT')
    if (absentStudents.length > 0) {
      const section = selectedSubject?.section ?? selectedSection ?? ''
      const missedLabel = PART_LABEL[activePart] ?? `Part ${activePart}`
      for (const s of absentStudents) {
        if (!s.email) continue
        // Fire-and-forget — don't block the save on email delivery
        notifyAttendanceAbsent(
          s.email, s.full_name, section, selectedDate, [missedLabel]
        ).catch(() => {})
        // Insert alert row (for HOD's Alerts module view)
        ;(supabase.from('attendance_alerts' as any) as any).insert({
          student_id: s.id,
          section,
          date: selectedDate,
          missed_parts: [activePart],
          alert_type: 'PARTIAL_ABSENT',
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        }).then(() => {})
      }
    }
    // ──────────────────────────────────────────────────────────
"""

# Insert notify block right before setSaving(false) inside saveDayAttendance
# The unique anchor is the auto-apply comment followed by subject attendance loop end
target = "    setSaving(false)\n    setSaveMsg(`✓ Part ${activePart} attendance saved · Subjects auto-updated`)"
replacement = NOTIFY_BLOCK + "\n    setSaving(false)\n    setSaveMsg(`✓ Part ${activePart} attendance saved · Subjects auto-updated`)"

if target in src:
    src = src.replace(target, replacement, 1)
    with open(path, "w") as f:
        f.write(src)
    print("  ✓ Notification block inserted into saveDayAttendance()")
else:
    print("  ⚠ Could not find anchor in attendance-module.tsx — patch it manually (see README)")
PYEOF


# ── STEP 5: Patch leaves-module.tsx ──────────────────────────
echo ""
echo "▶ Step 5 — Updating leaves-module.tsx to use the secure API route"

python3 << 'PYEOF'
path = "src/components/modules/leaves-module.tsx"
with open(path, "r") as f:
    src = f.read()

# Replace direct import of sendEmail/emailTemplates with the new notifier
old_import = 'import { sendEmail, emailTemplates } from "@/lib/email"'
new_import  = 'import { notifyLeaveDecision } from "@/lib/send-notification"'

if old_import in src:
    src = src.replace(old_import, new_import, 1)

    # Replace the template + sendEmail call inside reviewLeave
    old_call = """        const tmpl = emailTemplates.leaveDecision(
          applicant.full_name, status, leave.leave_type,
          new Date(leave.from_date).toLocaleDateString(),
          new Date(leave.to_date).toLocaleDateString()
        )
        await sendEmail({ to: applicant.email, ...tmpl })"""

    new_call = """        await notifyLeaveDecision(
          applicant.email, applicant.full_name, status, leave.leave_type,
          new Date(leave.from_date).toLocaleDateString(),
          new Date(leave.to_date).toLocaleDateString()
        )"""

    if old_call in src:
        src = src.replace(old_call, new_call, 1)
        with open(path, "w") as f:
            f.write(src)
        print("  ✓ leaves-module.tsx updated to use notifyLeaveDecision()")
    else:
        print("  ⚠ Could not find sendEmail call in reviewLeave — patch manually")
else:
    print("  ⚠ Could not find import in leaves-module.tsx — already patched or different?")
PYEOF


# ── STEP 6: Rebuild and verify ───────────────────────────────
echo ""
echo "▶ Step 6 — Type-checking the project"
npx tsc --noEmit && echo "  ✓ TypeScript clean — no errors" || echo "  ⚠ TypeScript errors above — fix before deploying"


# ── STEP 7: Print next actions ───────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done! Manual steps remaining:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1. Set Vercel env var (removes old NEXT_PUBLIC key):"
echo "     npx vercel env rm NEXT_PUBLIC_RESEND_API_KEY production"
echo "     npx vercel env add RESEND_API_KEY production"
echo "     (paste your re_xxxxxxx key when prompted)"
echo ""
echo "  2. Redeploy to Vercel:"
echo "     npx vercel --prod"
echo ""
echo "  3. Test locally:"
echo "     npm run dev"
echo "     → Log in as HOD → Attendance → mark a student absent → save"
echo "     → Check that student's inbox within 30 seconds"
echo ""
echo "  4. Optional — verify the API route directly:"
echo "     curl -X POST http://localhost:3000/api/send-email \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"to\":\"your@email.com\",\"subject\":\"Test\",\"html\":\"<p>Working</p>\"}'"
echo ""
