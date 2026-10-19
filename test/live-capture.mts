/**
 * Capture what the adapter actually puts on the wire, then run one real turn.
 * Run: node test/live-capture.mts
 */
import { ZenAdapter } from '../src/adapter/zen-adapter.ts'

const realFetch = globalThis.fetch
const seen: Array<{ url: string; method: string; headers: Record<string, string>; body: string }> = []

globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === 'string' ? input : String(input?.url ?? input)
  const headers: Record<string, string> = {}
  const h = init?.headers ?? (input?.headers as any)
  if (h) {
    if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v: string, k: string) => { headers[k.toLowerCase()] = v })
    else if (Array.isArray(h)) for (const [k, v] of h) headers[String(k).toLowerCase()] = String(v)
    else for (const [k, v] of Object.entries(h)) headers[String(k).toLowerCase()] = String(v)
  }
  let body = ''
  try {
    body = typeof init?.body === 'string' ? init.body : init?.body ? await new Response(init.body).text() : ''
  } catch { body = '<unreadable>' }
  seen.push({ url, method: init?.method ?? 'GET', headers, body })
  return realFetch(input, init)
}) as typeof fetch

const adapter = new ZenAdapter(
  {
    list: () => ['deepseek-v4.1-flash-free'],
    decision: () => ({ allowed: true, source: 'live' }),
    reasoningCapability: () => ({ reasoning: true, effortValues: [] }),
  } as never,
  { firstEventMs: 30_000, bodyIdleMs: 60_000 },
)

let text = ''
let kind = 'none'
let failure: string | undefined
for await (const chunk of adapter.stream({
  provider: 'opencode2dsh',
  model: 'deepseek-v4.1-flash-free',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly one word: OK.' }] }],
  temperature: 0,
  maxTokens: 128,
} as never)) {
  if (chunk.type === 'text-delta') text += chunk.text
  if (chunk.type === 'finish') {
    const reason = chunk.reason as { kind: string; failure?: { message: string } }
    kind = reason.kind
    failure = reason.failure?.message
  }
}

for (const req of seen) {
  console.log(`\n>>> ${req.method} ${req.url}`)
  for (const [k, v] of Object.entries(req.headers).sort()) console.log(`    ${k}: ${v}`)
  console.log(`    body: ${req.body.slice(0, 700)}`)
}
console.log(`\nresult: kind=${kind} text=${JSON.stringify(text)} ${failure ? 'failure=' + failure.slice(0, 200) : ''}`)
