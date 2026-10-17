# LICET Attendance Station

Students mark their own attendance from their phones, but only if they are
physically in the classroom. The staff member's laptop hosts the classroom Wi-Fi
and shows a QR code that changes every 10 seconds (Configuration → Attendance rules). The staff member can still
change anyone's mark before submitting.

```
 phone ──(laptop's own Wi-Fi only)──▶ laptop: Attendance Station ──(laptop's internet)──▶ ERP database
   scan rotating QR → register no + PIN        checks QR is fresh, one phone = one student     att_station_mark()
```

## Is Wi-Fi Direct possible? (what works, honestly)

| Approach | Works? | Notes |
|---|---|---|
| A web page that checks "is this phone on the teacher's Wi-Fi Direct?" | **No** | Browsers cannot read the Wi-Fi name or detect Wi-Fi Direct peers. Every website-only "Wi-Fi attendance" relies on something else. |
| Phone ↔ laptop **Wi-Fi Direct P2P** pairing | Android only | iPhones have no Wi-Fi Direct API, so a P2P-only design would leave out iPhone users. |
| Laptop runs a **Wi-Fi Direct "legacy mode" access point** (Windows 10/11) | **Yes**, used here | Any phone (Android or iPhone) joins it like normal Wi-Fi. It does **not** share internet, which is fine: phones only talk to the laptop, and the laptop uses its own Ethernet or college Wi-Fi to reach the ERP. Most laptop Wi-Fi cards run both at once. `windows/start-hotspot.ps1` starts it. |
| Windows **Mobile Hotspot** | Yes | `start-hotspot.ps1 -Mode Hotspot`. It shares the laptop's internet and needs an internet connection to start. |
| macOS | Partly | Apple gives apps no way to create a hotspot. Use System Settings → General → Sharing → **Internet Sharing** (share Ethernet/USB to Wi-Fi). Or have the laptop and the students join the staff member's phone hotspot; any network without client isolation works. The station lists the laptop's addresses so you can pick the right one. |
| College Wi-Fi | Usually no | Campus networks usually block phones from reaching other devices (client isolation), and phones anywhere on campus share that network, so it proves nothing about being in the room. |

**What proves presence:** only devices on the laptop's own Wi-Fi can reach the station. On top of that:
- The QR code changes every 10 seconds, so a photo sent to a friend outside the room expires before it can be used.
- Optional (HOD setting): a 2-digit code shown on the projector next to the QR must also be typed, so even a live-relayed QR is not enough.
- Each scan gets a 3-minute ticket tied to that phone's network address.

**What proves identity:**
- The student's attendance PIN, which they set in the ERP and which is stored hashed.
- Their registered phone: the first phone a student uses is bound to them, and one phone can mark only one student. The HOD or class advisor can reset it.

The teacher sees the live count against the headcount and still submits manually, so any mismatch shows up on the spot.

## Using it (each class)

1. **Start the Wi-Fi.** On Windows, double-click `windows\Start-Attendance-Station.bat`. It starts the Wi-Fi window and the station, then opens the console. On macOS, turn on Internet Sharing, then double-click `start-station.command`.
2. **Open self check-in.** In the ERP, go to Attendance → your class → **Self check-in**. It stays open for 10 minutes.
3. **Start the QR.** In the station console (http://localhost:7070), sign in with your ERP account, tick the class, and press **Start**. Put the QR on the projector.
4. **Students check in.** They join the Wi-Fi (its name and password are shown in the Wi-Fi window), scan the QR, and enter their register number and PIN.
5. **Submit.** Press **Stop**. In the ERP, mark anyone without a phone, then press **Submit**. The hour locks 10 minutes later.

Each student sets their PIN once in the ERP, under **Attendance → Attendance PIN**.

If the laptop loses internet during check-in, check-ins are held in memory (never written to disk, because they contain PINs) and sent automatically when it reconnects. This only works while the check-in window is still open, so reconnect quickly. Any check-in the ERP refuses after reconnecting is listed on the console — mark those students by hand before you submit. Closing the station drops anything still waiting.

## Setup (once per laptop)

- Install Node.js 18 or newer (https://nodejs.org).
- Copy `.env.example` to `.env` and fill in the project URL and **anon** key: the same public values the website uses. Never put the service-role key on a laptop. In a full checkout of this repository, `../.env.local` is read automatically.
- Windows: if PowerShell blocks the script, the `.bat` already runs it with `-ExecutionPolicy Bypass`. The Wi-Fi window must stay open during the class.

## Files

| File | What it is |
|---|---|
| `server.mjs` | The station: student check-in on the classroom network, and the staff console, which answers only from the laptop itself. |
| `public/checkin.html` | The phone page. |
| `public/console.html` | The staff console with the QR code. |
| `windows/start-hotspot.ps1` | Wi-Fi Direct legacy access point, or Mobile Hotspot. |
| `windows/Start-Attendance-Station.bat`, `start-station.command` | Double-click launchers. |

Later, the station could be wrapped as a one-click installer (Electron or Tauri) so laptops don't need Node.js installed. The way it works would stay the same.
