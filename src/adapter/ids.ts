import { createHash, randomBytes } from 'node:crypto'

/**
 * Port of agent/internal/ids (opencode2api ids.go, verbatim semantics):
 * stable session/project ids derived from the conversation's first user turn,
 * and a per-request random id. The upstream sees CLI-identical correlation
 * headers built from these (zen-adapter.ts).
 */

export interface RequestIDs {
  session: string
  request: string
  project: string
  parentSession: string
}

/** sha256("prefix\0value") truncated to 12 bytes: stable, non-reversible. */
export function stableID(prefix: string, value: string): string {
  const sum = createHash('sha256').update(prefix + '\x00' + value).digest()
  return `${prefix}_${sum.subarray(0, 12).toString('hex')}`
}

export function randomID(prefix: string, size: number): string {
  return `${prefix}_${randomBytes(size).toString('hex')}`
}

export function firstString(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return ''
}

/**
 * The conversation signal: JSON of the first user message's content. Using the
 * first user turn keeps a multi-turn conversation stable as its history grows
 * while separating conversations with different beginnings (ids.go:59-76).
 */
export function conversationSeed(messages: Array<{ role: string; content: unknown }>): string {
  for (const message of messages) {
    if (message.role !== 'user') continue
    const encoded = JSON.stringify(message.content ?? null)
    if (encoded !== 'null' && encoded.length > 0) return encoded
  }
  return ''
}

/**
 * The project id the V2 gate accepts: 40 lowercase hex (the official CLI's
 * shape) or the literal "global". The earlier `prj_<24hex>` correlation form is
 * refused with 403 on its own, everything else held fixed (live-probed
 * 2026-10-15 22:40). Stable per install, so upstream affinity keeps behaving
 * like one workspace.
 */
export function projectID(): string {
  return createHash('sha256').update('opencode2dsh:default-project').digest('hex').slice(0, 40)
}

/**
 * Derive the correlation ids for one upstream request. In adapter mode there
 * are no inbound opencode headers, so the seed is the conversation itself.
 */
export function deriveRequestIDs(messages: Array<{ role: string; content: unknown }>): RequestIDs {
  let signal = conversationSeed(messages)
  if (signal === '' || signal === '{}') signal = randomID('fallback', 16)
  return {
    session: canonicalSessionID(signal),
    request: randomID('req', 16),
    project: projectID(),
    parentSession: '',
  }
}

/**
 * OpenCode's canonical session shape: "ses_" + 12 lowercase hex timestamp
 * characters + 14 Base62 characters. Since 2026-09-16 the Zen free tier
 * rejects any other session shape with 403 FreeTierError ("free tier can
 * only be used from within OpenCode"). Since 2026-10-13 it additionally
 * validates the timestamp field produced by Identifier.descending(): the
 * inverted 48-bit value must end in the counter window 0xfc0-0xfff.
 * Live-probed 2026-10-13: a plain hashed timestamp 403s while the descending
 * encoding succeeds, with the existing streaming + bash/read body gate.
 */
const CANONICAL_SESSION_PATTERN = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/
const DESCENDING_TIME_PART_PATTERN = /^[0-9a-f]{9}f[c-f][0-9a-f]$/

const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function base62Fixed(value: bigint, width: number): string {
  const base = 62n
  let n = value
  const out = new Array<string>(width)
  for (let i = width - 1; i >= 0; i--) {
    out[i] = BASE62_ALPHABET.charAt(Number(n % base))
    n /= base
  }
  return out.join('')
}

/**
 * Render six hash bytes in the layout minted by OpenCode's
 * Identifier.descending(): use the first 36 hash bits as a stable timestamp,
 * append counter 1, then invert the 48-bit word. The resulting suffix is ffe,
 * inside the free-tier gate's accepted counter window.
 */
function descendingTimePart(hash: Buffer): string {
  let current = (
    (BigInt(hash[0]!) << 28n)
    | (BigInt(hash[1]!) << 20n)
    | (BigInt(hash[2]!) << 12n)
    | (BigInt(hash[3]!) << 4n)
    | (BigInt(hash[4]!) >> 4n)
  ) << 12n
  current |= 1n
  return ((~current) & 0xffffffffffffn).toString(16).padStart(12, '0')
}

/**
 * The session id sent upstream. Only sessions carrying the official descending
 * time encoding pass through unchanged. Other identities — including legacy
 * canonical-shape IDs with a raw-hash timestamp — are deterministically
 * re-encoded, so the same conversation keeps a stable session while satisfying
 * the current free-tier gate.
 */
export function canonicalSessionID(signal: string): string {
  if (CANONICAL_SESSION_PATTERN.test(signal) && DESCENDING_TIME_PART_PATTERN.test(signal.slice(4, 16))) return signal
  const sum = createHash('sha256').update('ses\x00' + signal).digest()
  const timePart = descendingTimePart(sum.subarray(0, 6))
  const randomPart = base62Fixed(BigInt('0x' + sum.subarray(6, 16).toString('hex')), 14)
  return `ses_${timePart}${randomPart}`
}

/**
 * The CLI version the free-tier gate is told about. Upstream enforces a floor
 * (live-probed 2026-10-19: below 1.18.0 answers `426 UpgradeRequired` with
 * "OpenCode 1.18.0 or newer is required"), so keep this at or above the floor
 * and bump it when a `426` shows up.
 */
export const OPENCODE_CLI_VERSION = '2.0.32'

/**
 * CLI-identical user agent.
 *
 * The V2 gate stopped accepting the old `opencode/<ver> (<platform> <arch>;
 * node<ver>)` form on 2026-10-19: that shape 403s while
 * `opencode/latest/<ver>/cli` (the form the CLI v2 itself sends) returns 200,
 * everything else held fixed. No platform/runtime segment.
 */
export function opencodeUserAgent(): string {
  return `opencode/latest/${OPENCODE_CLI_VERSION}/cli`
}

/**
 * The full disguise header set sent with every upstream request
 * (design.md 2.4; gateway.go newUpstreamRequest:640-669).
 *
 * Two corrections from the 2026-10-15 22:30 ablation (docs/zen-free-tier-status.md):
 * `x-opencode-session-id` is REQUIRED — dropping it alone flips a passing
 * request to `403 FreeTierError`; and `x-opencode-request` is deliberately NOT
 * sent — its presence alone flips a passing request to `403`. `RequestIDs.request`
 * is still derived and exposed for callers that want the correlation id, it is
 * just not put on the wire.
 */
export function disguiseHeaders(ids: RequestIDs): Record<string, string> {
  return {
    'user-agent': opencodeUserAgent(),
    'x-opencode-client': 'cli',
    'x-opencode-session': ids.session,
    'x-opencode-session-id': ids.session,
    'x-session-affinity': ids.session,
    'X-Session-Id': ids.session,
    'x-opencode-project': ids.project,
  }
}
