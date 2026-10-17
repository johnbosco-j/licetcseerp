#!/usr/bin/env node
// LICET Attendance Station — runs on a staff laptop.
//
// The laptop hosts its own Wi-Fi (Windows: Wi-Fi Direct / Mobile Hotspot; macOS:
// Internet Sharing or a shared hotspot). Students join it, scan the rotating QR on
// the projector and check in with register number + their ERP attendance PIN.
// Only phones on this network can reach this server, which is what proves they
// are in the room; the PIN and the phone's one-time registration prove who they are.
// The laptop relays each check-in to the ERP over its own internet connection.
//
// Staff console: http://localhost:7070 (only from this laptop)

import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.STATION_PORT || 7070)

// ── configuration (public project URL + anon key, never the service key) ───
function readEnv(file) {
  try {
    return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l))
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
  } catch { return {} }
}
const env = { ...readEnv(path.join(DIR, '..', '.env.local')), ...readEnv(path.join(DIR, '.env')), ...process.env }
const URL_ = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !ANON) {
  console.error('\nSet SUPABASE_URL and SUPABASE_ANON_KEY in station/.env (copy station/.env.example).\n')
  process.exit(1)
}
const sb = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: true } })

// ── state ──────────────────────────────────────────────────────────────────
const state = {
  staff: null,            // { id, name }
  sessions: [],           // the class hours being checked into (a lab block = several)
  title: '',
  rotate: 15,             // seconds; read from ERP settings after sign-in
  nonces: [],             // current + previous QR codes
  marked: new Map(),      // register no → { name, at, ip }
  byIp: new Map(),        // ip → register no (one student per phone per class)
  queue: [],              // check-ins waiting for the internet to come back (memory only: they hold PINs)
  failed: [],             // queued check-ins the ERP refused once the internet returned
  tickets: new Map(),     // ticket → { ip, exp } issued when a fresh QR is scanned
  lastError: '',
}
// An older version kept the offline queue in queue.json, PINs included; remove it.
try { fs.unlinkSync(path.join(DIR, 'queue.json')) } catch { /* none */ }

function rotate() {
  state.nonces = [crypto.randomBytes(6).toString('base64url'), ...state.nonces].slice(0, 2)
}
rotate()
let rotTimer = setInterval(rotate, state.rotate * 1000)

function lanAddresses() {
  const out = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address })
  }
  // Windows Mobile Hotspot / Wi-Fi Direct group owner is normally 192.168.137.1
  return out.sort((a, b) => (b.address.startsWith('192.168.137.') ? 1 : 0) - (a.address.startsWith('192.168.137.') ? 1 : 0))
}
let hostIp = process.env.STATION_IP || lanAddresses()[0]?.address || '127.0.0.1'

// ── helpers ────────────────────────────────────────────────────────────────
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
// Console calls must come from the console page itself, not from another site open in the laptop's browser.
const sameOrigin = req => { const o = req.headers.origin; return !o || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(o) }
const clientIp = req => (req.socket.remoteAddress || '').replace('::ffff:', '')
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}
const readBody = req => new Promise(resolve => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy() })
  req.on('end', () => { try { resolve(JSON.parse(d || '{}')) } catch { resolve({}) } })
})
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
const page = name => fs.readFileSync(path.join(DIR, 'public', name), 'utf8')

async function markOne(item) {
  // one check-in, applied to every hour of the block
  let last = null
  for (const sid of item.sessions) {
    const { data, error } = await sb.rpc('att_station_mark', { p_session: sid, p_register: item.reg, p_pin: item.pin, p_device: item.device })
    if (error) throw error            // network / auth trouble → caller queues it
    last = data
    if (!data?.ok) return data
  }
  return last
}
async function flushQueue() {
  if (!state.queue.length || !state.staff) return
  const left = []
  for (const item of state.queue) {
    try {
      const r = await markOne(item)
      // refused now (e.g. the check-in window closed): the teacher must mark them by hand
      if (!r?.ok) { state.failed.push({ reg: item.reg, error: r?.error ?? 'Not accepted' }); state.marked.delete(item.reg) }
      else state.marked.set(item.reg, { name: r.name, at: Date.now(), ip: state.marked.get(item.reg)?.ip })
    } catch { left.push(item) }
  }
  state.queue = left
}
setInterval(flushQueue, 10_000)

async function openClasses() {
  // hours the signed-in staff member opened for self check-in today
  const { data, error } = await sb.from('attendance_sessions')
    .select('id, date, period_no, section, cohort_grad_year, subject_id, label, audience, audience_value, roster, absent, self_open_until, mode, status, subjects(code, short_name, name)')
    .eq('date', today()).eq('mode', 'SELF').neq('status', 'SUBMITTED').order('period_no')
  if (error) throw error
  const now = Date.now()
  return (data ?? []).filter(s => s.self_open_until && Date.parse(s.self_open_until) > now)
}

// ── server ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  try {
    // Student pages (reachable from phones on the station's Wi-Fi)
    if (u.pathname === '/m' && req.method === 'GET') return send(res, 200, page('checkin.html'), 'text/html; charset=utf-8')
    if (u.pathname === '/api/ticket' && req.method === 'POST') {
      // a fresh QR (scanned in the room just now) buys three minutes to type the PIN
      const b = await readBody(req)
      if (!state.sessions.length) return send(res, 409, { ok: false, error: 'Check-in is not open right now' })
      if (!state.nonces.includes(String(b.nonce || ''))) return send(res, 410, { ok: false, error: 'This QR code has expired — scan the one on the screen again' })
      const t = crypto.randomBytes(12).toString('base64url')
      const now = Date.now()
      for (const [k, v] of state.tickets) if (v.exp < now) state.tickets.delete(k)
      state.tickets.set(t, { ip: clientIp(req), exp: now + 180_000 })
      return send(res, 200, { ok: true, ticket: t, title: state.title })
    }
    if (u.pathname === '/api/checkin' && req.method === 'POST') {
      const b = await readBody(req)
      const ip = clientIp(req)
      if (!state.sessions.length) return send(res, 409, { ok: false, error: 'Check-in is not open right now' })
      const tk = state.tickets.get(String(b.ticket || ''))
      if (!tk || tk.exp < Date.now() || tk.ip !== ip) return send(res, 410, { ok: false, error: 'Time ran out — scan the QR code on the screen again' })
      const reg = String(b.reg || '').trim().toUpperCase(), pin = String(b.pin || ''), device = String(b.device || '').slice(0, 80)
      if (!/^\d{12}$|^\d{2}CS\d{3}$/.test(reg)) return send(res, 400, { ok: false, error: 'Enter your 12-digit register number' })
      if (!/^\d{4,6}$/.test(pin)) return send(res, 400, { ok: false, error: 'Enter your 4–6 digit attendance PIN' })
      if (!device) return send(res, 400, { ok: false, error: 'Your browser blocked storage; open the link in Chrome or Safari normally (not private mode)' })
      const prior = state.byIp.get(ip)
      if (prior && prior !== reg) return send(res, 429, { ok: false, error: 'This phone already checked in another student' })
      if (state.marked.has(reg)) return send(res, 200, { ok: true, name: state.marked.get(reg).name, already: true })
      const item = { sessions: state.sessions.map(s => s.id), reg, pin, device, at: new Date().toISOString() }
      try {
        const r = await markOne(item)
        if (!r?.ok) return send(res, 403, r ?? { ok: false, error: 'Not accepted' })
        state.marked.set(reg, { name: r.name, at: Date.now(), ip }); state.byIp.set(ip, reg)
        state.tickets.delete(String(b.ticket))   // one check-in per scan
        return send(res, 200, { ok: true, name: r.name })
      } catch (e) {
        // laptop lost internet: keep it and send when the connection returns
        state.queue.push(item); state.lastError = e.message
        state.marked.set(reg, { name: reg + ' (pending)', at: Date.now(), ip }); state.byIp.set(ip, reg)
        state.tickets.delete(String(b.ticket))
        return send(res, 202, { ok: true, name: 'Saved on the teacher\'s laptop — it is sent when the internet is back. Your teacher will confirm.', pending: true })
      }
    }

    // Everything below is the staff console: only from this laptop.
    if (!isLocal(req)) return send(res, 404, 'Not found', 'text/plain')
    if (req.method === 'POST' && !sameOrigin(req)) return send(res, 403, { error: 'Not allowed' })
    if (u.pathname === '/' && req.method === 'GET') return send(res, 200, page('console.html'), 'text/html; charset=utf-8')
    if (u.pathname === '/api/login' && req.method === 'POST') {
      const b = await readBody(req)
      const { data, error } = await sb.auth.signInWithPassword({ email: String(b.email || '').toLowerCase(), password: String(b.password || '') })
      if (error || !data.user) return send(res, 401, { error: 'Sign-in failed — use your ERP email and password' })
      const { data: p } = await sb.from('profiles').select('id, full_name, role').eq('id', data.user.id).single()
      if (!p || p.role === 'STUDENT') { await sb.auth.signOut(); return send(res, 403, { error: 'Only staff can run the Attendance Station' }) }
      state.staff = { id: p.id, name: p.full_name }
      const { data: st } = await sb.from('app_settings').select('value').eq('key', 'attendance.qr_rotate_seconds').maybeSingle()
      state.rotate = Math.max(5, Number(st?.value ?? 15)); clearInterval(rotTimer); rotTimer = setInterval(rotate, state.rotate * 1000)
      return send(res, 200, { ok: true, name: p.full_name })
    }
    if (u.pathname === '/api/logout' && req.method === 'POST') { await sb.auth.signOut(); state.staff = null; state.sessions = []; return send(res, 200, { ok: true }) }
    if (u.pathname === '/api/classes') {
      if (!state.staff) return send(res, 401, { error: 'Sign in first' })
      return send(res, 200, { classes: await openClasses(), addresses: lanAddresses(), hostIp, port: PORT })
    }
    if (u.pathname === '/api/start' && req.method === 'POST') {
      const b = await readBody(req)
      const all = await openClasses()
      state.sessions = all.filter(s => (b.ids || []).includes(s.id))
      state.title = b.title || ''
      if (b.hostIp) hostIp = b.hostIp
      state.marked.clear(); state.byIp.clear(); state.failed = []; rotate()
      return send(res, 200, { ok: true, count: state.sessions.length })
    }
    if (u.pathname === '/api/stop' && req.method === 'POST') { state.sessions = []; return send(res, 200, { ok: true }) }
    if (u.pathname === '/api/status') {
      const link = `http://${hostIp}:${PORT}/m?n=${state.nonces[0]}`
      const qr = state.sessions.length ? await QRCode.toDataURL(link, { margin: 1, width: 640, errorCorrectionLevel: 'M' }) : null
      let present = null, total = null
      if (state.sessions[0]) {
        const { data } = await sb.from('attendance_sessions').select('roster, absent, self_open_until').eq('id', state.sessions[0].id).single()
        if (data) { total = data.roster.length; present = data.roster.length - data.absent.length }
      }
      return send(res, 200, {
        staff: state.staff, open: state.sessions.length > 0, title: state.title, qr, link, rotate: state.rotate,
        present, total, recent: [...state.marked.values()].sort((a, b) => b.at - a.at).slice(0, 12).map(m => m.name),
        pending: state.queue.length, lastError: state.lastError,
        failed: state.failed.map(f => `${f.reg}: ${f.error}`),
      })
    }
    return send(res, 404, 'Not found', 'text/plain')
  } catch (e) {
    return send(res, 500, { ok: false, error: e?.message || 'Station error' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  LICET Attendance Station')
  console.log(`  Staff console:  http://localhost:${PORT}   (open this on the laptop)`)
  for (const a of lanAddresses()) console.log(`  Student network ${a.name.padEnd(18)} http://${a.address}:${PORT}/m`)
  console.log('\n  Start your hotspot first (see station/README.md), then sign in on the console.\n')
})
