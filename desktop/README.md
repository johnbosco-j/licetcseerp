# LICET Things Staff (desktop app)

The ERP for staff as a Windows / macOS app, with the **Attendance Station built in**:
no separate install, no terminal.

- **File → ERP home**, and the whole ERP as on the website (sign-in, two-step, everything).
- **Attendance → Open Attendance Station**: starts the station on this computer and opens its
  console (sign in, tick the class, Start, show the QR). Phones on the classroom Wi-Fi reach it.
- **Attendance → Start classroom Wi-Fi** (Windows): starts the Wi-Fi Direct access point
  (`station/windows/start-hotspot.ps1`). On a Mac: *Classroom Wi-Fi help* opens Sharing settings.
- **File → Change ERP address…**: for the move to the college server (the app restarts).
- Students who sign in are signed out: the app is for staff.

Allow the app through the firewall when asked (the station listens on port 7070 for phones).

## Build

```bash
cd desktop
npm install && node node_modules/electron/install.js
npm run dist:mac      # dist/*.dmg (Apple silicon + Intel)
npm run dist:win      # dist/*.exe (works on a Mac too)
```

`npm run prepare-app` writes `config.json` from the repo `.env.local` (public values only:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, optional `ERP_URL`) and copies the
station in. It refuses a service-role key. GitHub: Actions → *Desktop app* builds both installers.

## Signing

The installers are not code-signed yet. Windows shows "Windows protected your PC" → *More
info* → *Run anyway*. macOS: open it once from System Settings → Privacy & Security →
*Open Anyway*. To remove the warnings: an Apple Developer ID (Apple Developer Program) for
macOS signing and notarization, and a Windows code-signing certificate.
