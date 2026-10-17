// Shared helpers for the end-to-end checks. LOCAL STACK ONLY (supabase start + seed-local).
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

export const URL_ = process.env.API_URL ?? 'http://127.0.0.1:54321'
export const ANON = process.env.ANON_KEY
export const SERVICE = process.env.SERVICE_ROLE_KEY
export const PW = 'LocalTest#2026'
export const STATION = `http://127.0.0.1:${process.env.STATION_PORT ?? 7071}`
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL_)) throw new Error('End-to-end checks run against the local stack only')
if (!ANON || !SERVICE) throw new Error('Set ANON_KEY and SERVICE_ROLE_KEY (eval "$(supabase status -o env)")')

export const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
export async function signIn(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: PW })
  if (error) throw new Error(`${email}: ${error.message}`)
  return c
}
let failed = 0
export const check = (cond, msg, info = '') => { if (!cond) failed++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}${cond ? '' : '  — ' + info}`) }
export const failures = () => failed
export const post = (path, body, headers = {}) => fetch(STATION + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))
export const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)

/** RFC 6238 code for an authenticator secret (base32). */
export function totp(secret) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''
  for (const ch of secret.replace(/=+$/, '')) bits += a.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)))
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const h = crypto.createHmac('sha1', key).update(c).digest(); const o = h[19] & 15
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0')
}
