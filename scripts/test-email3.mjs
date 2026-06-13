const RESEND_API_KEY = 're_6dJ5jN3d_8FXbZFgGsVPcz77XjtqPJhKB'

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${RESEND_API_KEY}`
  },
  body: JSON.stringify({
    from: 'Excelsior ERP <onboarding@resend.dev>',
    to: ['mailtojjohnbosco@gmail.com'],
    subject: 'Excelsior ERP — Attendance Alert Test',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px">
        <div style="background:#1a1a2e;padding:16px 20px;border-radius:6px 6px 0 0;margin:-20px -20px 20px">
          <h1 style="color:#fff;margin:0;font-size:18px">Excelsior ERP — LICET CSE</h1>
          <p style="color:#aaa;margin:4px 0 0;font-size:12px">Automated Attendance Alert</p>
        </div>
        <p style="color:#333;font-size:14px">Dear <strong>Ishowbosco J</strong>,</p>
        <p style="color:#333;font-size:14px">Your attendance was marked <strong style="color:#d32f2f">ABSENT</strong> for the following session(s) on <strong>21 March 2026</strong>:</p>
        <div style="background:#fff3f3;border-left:4px solid #d32f2f;padding:12px 16px;margin:16px 0;border-radius:4px">
          <p style="margin:4px 0;color:#d32f2f;font-size:14px">• Part II (10:10 AM — P3, P4, P5)</p>
          <p style="margin:4px 0;color:#d32f2f;font-size:14px">• Part III (1:30 PM — P6, P7, P8)</p>
        </div>
        <p style="color:#333;font-size:14px">You are requested to <strong>meet Dr. Sharmila V J, Head of Department — CSE</strong> at the earliest to clarify your absence.</p>
        <div style="background:#f5f5f5;padding:12px 16px;border-radius:4px;margin:16px 0">
          <p style="margin:0;color:#555;font-size:13px"><strong>Section:</strong> II CSE-A</p>
          <p style="margin:4px 0 0;color:#555;font-size:13px"><strong>Date:</strong> 21 March 2026</p>
          <p style="margin:4px 0 0;color:#555;font-size:13px"><strong>Action Required:</strong> Meet HoD and get clearance</p>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
        <p style="color:#888;font-size:12px;margin:0">Excelsior ERP — Department of CSE, LICET Chennai 600 034</p>
        <p style="color:#888;font-size:12px;margin:4px 0 0">Please do not reply to this email.</p>
      </div>
    `
  })
})

const data = await res.json()
if (res.ok) {
  console.log('✓ Email sent to mailtojjohnbosco@gmail.com')
  console.log('  ID:', data.id)
} else {
  console.log('✗ Failed:', data.message)
}
