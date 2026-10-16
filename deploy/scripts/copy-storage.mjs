#!/usr/bin/env node
// Copy every uploaded file (all Storage buckets) from Supabase cloud to the
// self-hosted Supabase. The database dump brings the file *records* across;
// this brings the files themselves.
//
// Run from the repository root (uses the app's @supabase/supabase-js):
//
//   OLD_SUPABASE_URL=https://<ref>.supabase.co  OLD_SERVICE_ROLE_KEY=...  \
//   NEW_SUPABASE_URL=https://erp-api.example.ac.in  NEW_SERVICE_ROLE_KEY=... \
//   node deploy/scripts/copy-storage.mjs [--dry-run] [--bucket NAME] [--resume]
//
// Safe to run again: uploads overwrite (upsert). With --resume, a file that
// can already be downloaded from the new server with the same size is
// skipped, so an interrupted copy continues where it stopped. Buckets missing
// on the new server are created with the same settings. Exits 1 if any file
// failed. Never put these keys in a file that is committed.

import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const RESUME = args.includes('--resume')
const onlyBucket = args.includes('--bucket') ? args[args.indexOf('--bucket') + 1] : null
const CONCURRENCY = Number(process.env.COPY_CONCURRENCY || 4)
const PAGE = 1000

function need(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing environment variable ${name}. See the header of this script.`)
    process.exit(2)
  }
  return v
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const oldDb = createClient(need('OLD_SUPABASE_URL'), need('OLD_SERVICE_ROLE_KEY'), opts)
const newDb = createClient(need('NEW_SUPABASE_URL'), need('NEW_SERVICE_ROLE_KEY'), opts)
if (process.env.OLD_SUPABASE_URL === process.env.NEW_SUPABASE_URL) {
  console.error('OLD_SUPABASE_URL and NEW_SUPABASE_URL are the same; refusing to copy onto itself.')
  process.exit(2)
}

// List every file under `prefix`, recursing into folders (folders have id === null).
async function listAll(client, bucket, prefix = '') {
  const files = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) files.push(...(await listAll(client, bucket, path)))
      else files.push({ path, size: item.metadata?.size ?? null, mimetype: item.metadata?.mimetype, cacheControl: item.metadata?.cacheControl })
    }
    if (data.length < PAGE) break
  }
  return files
}

async function ensureBucket(b) {
  const { data: existing } = await newDb.storage.getBucket(b.id)
  if (existing) return
  console.log(`  creating bucket ${b.id} (public: ${b.public})`)
  if (DRY_RUN) return
  const { error } = await newDb.storage.createBucket(b.id, {
    public: b.public,
    fileSizeLimit: b.file_size_limit ?? undefined,
    allowedMimeTypes: b.allowed_mime_types ?? undefined,
  })
  if (error) throw new Error(`create bucket ${b.id}: ${error.message}`)
}

async function copyFile(bucket, f) {
  const { data: blob, error: dlErr } = await oldDb.storage.from(bucket).download(f.path)
  if (dlErr) throw new Error(`download: ${dlErr.message}`)
  const body = Buffer.from(await blob.arrayBuffer())
  const contentType = f.mimetype || blob.type || 'application/octet-stream'
  const cacheControl = (f.cacheControl || '').match(/max-age=(\d+)/)?.[1] ?? '3600'
  // upsert: the database restore already created the file's record.
  const { error: upErr } = await newDb.storage.from(bucket).upload(f.path, body, { contentType, cacheControl, upsert: true })
  if (upErr) throw new Error(`upload: ${upErr.message}`)
}

// The restored database already lists every file, so the listing on the new
// server cannot tell whether the bytes are there. Download and compare sizes.
async function alreadyCopied(bucket, f) {
  const { data, error } = await newDb.storage.from(bucket).download(f.path)
  return !error && data && (f.size === null || data.size === f.size)
}

async function pool(items, worker) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) await worker(items[i++])
  }))
}

const { data: buckets, error: bErr } = await oldDb.storage.listBuckets()
if (bErr) {
  console.error(`Cannot list buckets on the old project: ${bErr.message}`)
  process.exit(1)
}

let copied = 0, skipped = 0, failed = 0, bytes = 0
for (const b of buckets.filter((x) => !onlyBucket || x.id === onlyBucket)) {
  console.log(`Bucket ${b.id}`)
  await ensureBucket(b)
  const files = await listAll(oldDb, b.id)
  console.log(`  ${files.length} file(s)`)
  if (DRY_RUN) continue
  await pool(files, async (f) => {
    try {
      if (RESUME && (await alreadyCopied(b.id, f))) {
        skipped++
        return
      }
      await copyFile(b.id, f)
      copied++
      bytes += f.size ?? 0
      if (copied % 50 === 0) console.log(`  ... ${copied} copied`)
    } catch (e) {
      failed++
      console.error(`  FAILED ${b.id}/${f.path}: ${e.message}`)
    }
  })
}

console.log(`\nDone${DRY_RUN ? ' (dry run, nothing copied)' : ''}: ${copied} copied (${(bytes / 1048576).toFixed(1)} MB), ${skipped} already present, ${failed} failed.`)
process.exit(failed ? 1 : 0)
