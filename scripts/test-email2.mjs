const RESEND_API_KEY = 're_6dJ5jN3d_8FXbZFgGsVPcz77XjtqPJhKB'

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${RESEND_API_KEY}`
  },
  body: JSON.stringify({
    from: 'Excelsior ERP <onboarding@resend.dev>',
    to: ['johnbosco.28csa@licet.ac.in'],
    subject: 'Excelsior ERP — Test Notification',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
        <div style="background:#1a1a2e;padding:16px 20px;border-radius:6px 6px 0 0;margin:-20px -20px 20px">
          <h1 style="color:#fff;margin:0;font-size:18px">Excelsior ERP — LICET CSE</h1>
          <p style="color:#aaa;margin:4px 0 0;font-size:12px">Automated Notification System</p>
        </div>
        <p style="color:#333;font-size:14px">Dear <strong>Ishowbosco</strong>,</p>
        <p style="color:#333;font-size:14px">This is a test notification from <strong>Excelsior ERP</strong> confirming that the automated email system is working correctly for LICET CSE Department.</p>
        <div style="background:#f1f8e9;border-left:4px solid #2e7d32;padding:12px 16px;margin:16px 0;border-radius:4px">
          <p style="margin:0;font-size:14px;color:#2e7d32"><strong>✓ Email system is fully operational</strong></p>
          <p style="margin:6px 0 0;font-size:13px;color:#555">The following automated emails are now active:</p>
          <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;color:#555">
            <li>Attendance alerts — sent when you are absent (partial or full day)</li>
            <li>Leave approval / rejection notifications</li>
            <li>Grievance status updates</li>
            <li>Exam schedule notifications</li>
            <li>Meeting reminders to faculty</li>
          </ul>
        </div>
        <div style="background:#e8f0fe;border-left:4px solid #1a73e8;padding:12px 16px;margin:16px 0;border-radius:4px">
          <p style="margin:0;font-size:13px;color:#1a73e8"><strong>Attendance Alert Example:</strong></p>
          <p style="margin:6px 0 0;font-size:13px;color:#555">If you are absent in Part II (10:10 AM), you will receive an email asking you to meet Dr. Sharmila V J, HoD — CSE.</p>
        </div>
        <p style="color:#333;font-size:13px">Login to Excelsior ERP at <strong>localhost:3000</strong> to view your attendance, marks, and more.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#888;font-size:12px;margin:0">This is an automated message from Excelsior ERP.</p>
        <p style="color:#888;font-size:12px;margin:4px 0 0">Department of Computer Science and Engineering — LICET, Chennai 600 034</p>
        <p style="color:#888;font-size:12px;margin:4px 0 0">Please do not reply to this email.</p>
      </div>
    `
  })
})

const data = await res.json()
if (res.ok) {
  console.log('✓ Email sent successfully to johnbosco.28csa@licet.ac.in')
  console.log('  Email ID:', data.id)
} else {
  console.log('✗ Failed:', data.message ?? JSON.stringify(data))
}
