// Copies the Attendance Station into the app and writes config.json (public values only:
// the ERP address, the Supabase URL and the anon key that the website itself ships).
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const app = path.join(here, '..'), repo = path.join(app, '..')
const env = {}
for (const f of [path.join(repo, '.env.local'), path.join(app, '.env')]) {
  if (!fs.existsSync(f)) continue
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^(\w+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
}
Object.assign(env, process.env)
const config = {
  erpUrl: env.ERP_URL || 'https://cseerp.vercel.app',
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  stationPort: 7070,
}
if (!config.supabaseUrl || !config.supabaseAnonKey) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (repo .env.local or desktop/.env)'); process.exit(1) }
if (/service_role/.test(Buffer.from((config.supabaseAnonKey.split('.')[1] ?? ''), 'base64').toString())) { console.error('Refusing: that is a service-role key, not the anon key'); process.exit(1) }
fs.writeFileSync(path.join(app, 'config.json'), JSON.stringify(config, null, 2) + '\n')

const dst = path.join(app, 'station')
fs.rmSync(dst, { recursive: true, force: true })
fs.mkdirSync(dst, { recursive: true })
for (const f of ['server.mjs', 'public', 'windows']) fs.cpSync(path.join(repo, 'station', f), path.join(dst, f), { recursive: true })
fs.mkdirSync(path.join(app, 'build'), { recursive: true })
fs.copyFileSync(path.join(repo, 'public', 'icons', 'icon-512.png'), path.join(app, 'build', 'icon.png'))
console.log(`Prepared: ERP ${config.erpUrl}, station copied`)
