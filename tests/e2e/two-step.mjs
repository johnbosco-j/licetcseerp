// Two-step sign-in: once the HOD has an authenticator, a password-only session has no HOD powers.
import { admin, signIn, check, totp } from './lib.mjs'

console.log('two-step.mjs')
const { data: hod } = await admin.from('profiles').select('id').eq('email', 'hod@test.local').single()
const clean = async () => { const { data } = await admin.auth.admin.mfa.listFactors({ userId: hod.id }); for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: hod.id, id: f.id }) }
await clean()
const a = await signIn('hod@test.local')
check((await a.rpc('is_hod')).data === true, 'HOD without an authenticator has HOD powers')
const { data: en, error } = await a.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e' })
if (error) throw error
check(!(await a.auth.mfa.challengeAndVerify({ factorId: en.id, code: totp(en.totp.secret) })).error, 'authenticator set up with a valid code')
const b = await signIn('hod@test.local')
const { data: lvl } = await b.auth.mfa.getAuthenticatorAssuranceLevel()
check(lvl.currentLevel === 'aal1' && lvl.nextLevel === 'aal2', 'password-only sign-in now needs the second step')
check((await b.rpc('is_hod')).data === false, 'password-only session has no HOD powers')
check(!!(await b.rpc('start_term', { p_year: '2090-2091', p_parity: 'ODD', p_starts: null, p_ends: null, p_copy_periods: false, p_make_current: false })).error, 'HOD-only action refused without the code')
check(!(await b.auth.mfa.challengeAndVerify({ factorId: en.id, code: totp(en.totp.secret) })).error && (await b.rpc('is_hod')).data === true, 'after the code the session has HOD powers')
await clean()
