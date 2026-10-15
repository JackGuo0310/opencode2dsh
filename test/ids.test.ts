import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { canonicalSessionID, conversationSeed, deriveRequestIDs, disguiseHeaders, opencodeUserAgent, randomID, stableID } from '../src/adapter/ids.ts'

test('stableID is deterministic and sha256-truncated', () => {
  const first = stableID('ses', 'hello')
  const second = stableID('ses', 'hello')
  assert.equal(first, second)
  assert.ok(first.startsWith('ses_'))
  const hex = first.slice('ses_'.length)
  assert.equal(hex.length, 24, '12 bytes hex')
  const expected = createHash('sha256').update('ses\x00hello').digest().subarray(0, 12).toString('hex')
  assert.equal(hex, expected)
  assert.notEqual(stableID('ses', 'world'), first)
  assert.notEqual(stableID('prj', 'hello'), first, 'prefix is part of the hash input')
})

test('randomID differs per call with the requested size', () => {
  const a = randomID('req', 16)
  const b = randomID('req', 16)
  assert.notEqual(a, b)
  assert.ok(a.startsWith('req_'))
  assert.equal(a.slice('req_'.length).length, 32, '16 bytes hex')
})

test('canonicalSessionID passes official descending sessions through unchanged', () => {
  const official = 'ses_00000000affeABCdefGHIjklMN'
  assert.match(official, /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
  assert.equal(canonicalSessionID(official), official)
  // Legacy raw-hash timestamps have the right outer shape but must be re-encoded.
  const legacy = 'ses_00000000abc0ABCdefGHIjklMN'
  assert.match(legacy, /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
  assert.notEqual(canonicalSessionID(legacy), legacy)
  // foreign shapes do NOT match the canonical gate: 24-hex is the wrong length
  assert.doesNotMatch('ses_0123456789abcdef01234567', /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
})

test('canonicalSessionID hashes foreign ids into the descending canonical shape', () => {
  // Regression vectors computed independently from opencode2api's
  // Identifier.descending encoding plus 10-byte big-endian base62, width 14.
  assert.equal(canonicalSessionID('"hello"'), 'ses_aea744412ffe0ySUUEO3741Ult')
  assert.equal(canonicalSessionID('admission:1.2.3.4:8080'), 'ses_5dd9bd88bffe39B83lyhD6aJHb')
  // deterministic: same conversation keeps a stable session
  assert.equal(canonicalSessionID('anything'), canonicalSessionID('anything'))
  // distinct identities stay distinct
  assert.notEqual(canonicalSessionID('a'), canonicalSessionID('b'))
})

test('deriveRequestIDs emits descending canonical-shape sessions', () => {
  const ids = deriveRequestIDs([{ role: 'user', content: 'hello' }])
  assert.match(ids.session, /^ses_[0-9a-f]{9}f[c-f][0-9a-f][0-9A-Za-z]{14}$/)
  assert.equal(ids.session.slice(14, 16), 'fe', 'counter 1 encodes to the descending ffe suffix')
})

test('conversationSeed uses the first user turn and skips non-user messages', () => {
  const messages = [
    { role: 'system', content: 'sys prompt' },
    { role: 'assistant', content: 'hi' },
    { role: 'user', content: { text: 'first question' } },
    { role: 'user', content: 'second' },
  ]
  assert.equal(conversationSeed(messages), JSON.stringify({ text: 'first question' }))
  assert.equal(conversationSeed([]), '')
  assert.equal(conversationSeed([{ role: 'assistant', content: 'x' }]), '')
  assert.equal(conversationSeed([{ role: 'user', content: null }]), '', 'null content is skipped')
})

test('deriveRequestIDs keeps the session stable across turns and randomizes requests', () => {
  const turnOne = [{ role: 'user', content: 'hello' }]
  const turnTwo = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi there' },
    { role: 'user', content: 'more' },
  ]
  const first = deriveRequestIDs(turnOne)
  const second = deriveRequestIDs(turnTwo)
  assert.equal(first.session, second.session)
  assert.notEqual(first.request, second.request)
  assert.equal(first.project, second.project)
  // 40 lowercase hex: the `prj_<24hex>` form 403s on its own (2026-10-15 22:40).
  assert.match(first.project, /^[0-9a-f]{40}$/)
  assert.equal(first.parentSession, '')
  // fallback: no user content at all still yields usable ids
  const empty = deriveRequestIDs([{ role: 'system', content: 'only system' }])
  assert.ok(empty.session.startsWith('ses_'))
  assert.notEqual(empty.session, deriveRequestIDs([{ role: 'system', content: 'only system' }]).session)
})

test('disguiseHeaders carries the CLI-identical correlation set', () => {
  const ids = deriveRequestIDs([{ role: 'user', content: 'hello' }])
  const headers = disguiseHeaders(ids)
  assert.equal(headers['user-agent'], opencodeUserAgent())
  assert.equal(headers['x-opencode-client'], 'cli')
  assert.equal(headers['x-opencode-session'], ids.session)
  // The V2 /inference/v1 gate requires the raw session id on
  // x-opencode-session-id: dropping it alone flips a 200 to a 403
  // (live-probed 2026-10-15 22:30).
  assert.equal(headers['x-opencode-session-id'], ids.session)
  assert.equal(headers['x-session-affinity'], ids.session)
  assert.equal(headers['X-Session-Id'], ids.session)
  // The V2 /inference/v1 gate 403s any request carrying x-opencode-request,
  // so it must never reach the wire (live-probed 2026-10-15).
  assert.equal(headers['x-opencode-request'], undefined)
  assert.equal(headers['x-opencode-project'], ids.project)
  assert.ok(headers['user-agent'].startsWith('opencode/'))
  assert.ok(headers['user-agent'].includes(process.platform))
})
