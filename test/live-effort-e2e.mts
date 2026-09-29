/**
 * Live e2e for the 1.0.9 effort fix: a real turn on the Zen anonymous lane
 * with thinking level Off, which used to 400 (the lane retired
 * reasoning_effort: none).
 *
 * Run: `node --experimental-strip-types test/live-effort-e2e.mts`
 */
import { ZenAdapter } from '../src/adapter/zen-adapter.ts'

const t0 = Date.now()
const log = (tag: string): void => console.log(`[${Date.now() - t0}ms] ${tag}`)

const adapter = new ZenAdapter(
  {
    list: () => ['space-bunny-free'],
    decision: () => ({ allowed: true, source: 'live' }),
    reasoningCapability: () => ({ reasoning: true, effortValues: [] }),
  } as never,
  { firstEventMs: 30_000, bodyIdleMs: 60_000 },
)

async function turn(label: string, reasoningEffort?: string): Promise<{ text: string; kind: string; failure?: string }> {
  const stream = adapter.stream({
    provider: 'opencode2dsh',
    model: 'space-bunny-free',
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly one word: OK.' }] }],
    temperature: 0,
    maxTokens: 128,
  } as never)
  let text = ''
  let kind = 'none'
  let failure: string | undefined
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'finish') {
      const reason = chunk.reason as { kind: string; failure?: { message: string } }
      kind = reason.kind
      failure = reason.failure?.message
    }
  }
  log(`${label}: kind=${kind} reply=${JSON.stringify(text.slice(0, 80))}${failure ? ` failure=${failure.slice(0, 160)}` : ''}`)
  return { text, kind, failure }
}

const off = await turn('effort=off')
const high = await turn('effort=high')
const pass = off.kind !== 'error' && high.kind !== 'error' && off.text.length > 0 && high.text.length > 0
log(pass ? 'EFFORT E2E PASS: both Off and High complete' : 'EFFORT E2E FAIL')
process.exit(pass ? 0 : 1)
