// Email service — Resend API.
// The key is server-only (no NEXT_PUBLIC prefix). Call sendEmail() only from
// server code; client components go through /api/send-email (send-notification.ts).

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const FROM_EMAIL     = process.env.EMAIL_FROM || 'LICET Things <onboarding@resend.dev>'

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
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Send failed' }
  }
}

// ── Email Templates ──────────────────────────────────────────────────────────

const INDIGO = '#1A0C4E'
const GOLD   = '#DCCAA0'

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function layout(kicker: string, inner: string) {
  return `
<div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e8e0cc;background:#ffffff">
  <div style="background:${INDIGO};padding:18px 24px;border-bottom:3px solid ${GOLD}">
    <h1 style="color:#ffffff;margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600">LICET &mdash; Department of CSE</h1>
    <p style="color:${GOLD};margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase">${esc(kicker)}</p>
  </div>
  <div style="padding:24px;color:#2b2540;font-size:14px;line-height:1.6">${inner}</div>
  <div style="background:#EFE6D1;padding:12px 24px;color:#6b6480;font-size:11px">
    Automated message from LICET Things &middot; Loyola-ICAM College of Engineering and Technology, Chennai. Please do not reply.
  </div>
</div>`
}

function panel(color: string, bg: string, inner: string) {
  return `<div style="background:${bg};border-left:4px solid ${color};padding:12px 16px;margin:16px 0">${inner}</div>`
}

export const emailTemplates = {

  attendanceAlert: (studentName: string, section: string, date: string, missedParts: string[]) => ({
    subject: `Attendance Alert — ${studentName} — ${date}`,
    html: layout('Attendance Alert', `
  <p>Dear <strong>${esc(studentName)}</strong>,</p>
  <p>You were marked <strong style="color:#b3261e">ABSENT without information</strong> for the following session(s) on <strong>${esc(date)}</strong>:</p>
  ${panel('#b3261e', '#fdf2f1', missedParts.map(p => `<p style="margin:4px 0;color:#b3261e">&bull; ${esc(p)}</p>`).join(''))}
  <p>Please <strong>meet the Head of Department, CSE</strong> at the earliest to explain your absence.</p>
  ${panel(INDIGO, '#F9F7F5', `<p style="margin:0"><strong>Section:</strong> ${esc(section)}</p><p style="margin:4px 0 0"><strong>Date:</strong> ${esc(date)}</p><p style="margin:4px 0 0"><strong>Action required:</strong> Meet the HoD and get the alert cleared</p>`)}`)
  }),

  leaveDecision: (studentName: string, status: 'APPROVED' | 'REJECTED', leaveType: string, fromDate: string, toDate: string, note?: string) => {
    const color = status === 'APPROVED' ? '#2e7d32' : '#b3261e'
    const bg    = status === 'APPROVED' ? '#f1f8e9' : '#fdf2f1'
    return {
      subject: `Leave ${status} — ${leaveType}`,
      html: layout('Leave Application Update', `
  <p>Dear <strong>${esc(studentName)}</strong>,</p>
  <p>Your leave application has been <strong style="color:${color}">${esc(status)}</strong>.</p>
  ${panel(color, bg, `<p style="margin:0"><strong>Type:</strong> ${esc(leaveType)}</p><p style="margin:4px 0 0"><strong>From:</strong> ${esc(fromDate)}</p><p style="margin:4px 0 0"><strong>To:</strong> ${esc(toDate)}</p>${note ? `<p style="margin:4px 0 0"><strong>Note:</strong> ${esc(note)}</p>` : ''}`)}`)
    }
  },

  grievanceUpdate: (studentName: string, subject: string, status: string, resolution?: string) => ({
    subject: `Grievance Update — ${status.replace(/_/g, ' ')}`,
    html: layout('Grievance Status Update', `
  <p>Dear <strong>${esc(studentName)}</strong>,</p>
  <p>Your grievance &ldquo;<strong>${esc(subject)}</strong>&rdquo; is now <strong>${esc(status.replace(/_/g, ' '))}</strong>.</p>
  ${resolution ? panel(INDIGO, '#F9F7F5', `<p style="margin:0"><strong>Resolution:</strong> ${esc(resolution)}</p>`) : ''}`)
  }),

  examSchedule: (studentName: string, exams: {subject: string; date: string; time: string; venue: string}[]) => ({
    subject: `Exam Schedule — ${exams.length} exam(s) scheduled`,
    html: layout('Exam Schedule', `
  <p>Dear <strong>${esc(studentName)}</strong>,</p>
  <p>The following exam(s) have been scheduled:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
    <tr style="background:${INDIGO};color:#fff">
      <th style="padding:8px 12px;text-align:left">Subject</th><th style="padding:8px 12px;text-align:left">Date</th>
      <th style="padding:8px 12px;text-align:left">Time</th><th style="padding:8px 12px;text-align:left">Venue</th>
    </tr>
    ${exams.map((e, i) => `
    <tr style="background:${i % 2 === 0 ? '#F9F7F5' : '#fff'}">
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(e.subject)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(e.date)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(e.time)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${esc(e.venue)}</td>
    </tr>`).join('')}
  </table>`)
  }),

  meetingReminder: (facultyName: string, meetingTitle: string, time: string, venue: string) => ({
    subject: `Meeting Reminder — ${meetingTitle}`,
    html: layout('Meeting Reminder', `
  <p>Dear <strong>${esc(facultyName)}</strong>,</p>
  <p>This is a reminder for the upcoming meeting:</p>
  ${panel(INDIGO, '#F9F7F5', `<p style="margin:0;font-size:15px;font-weight:bold">${esc(meetingTitle)}</p><p style="margin:4px 0 0">Time: ${esc(time)}</p><p style="margin:4px 0 0">Venue: ${esc(venue)}</p>`)}`)
  }),
}
