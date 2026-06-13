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
