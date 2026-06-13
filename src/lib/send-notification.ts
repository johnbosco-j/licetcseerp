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
