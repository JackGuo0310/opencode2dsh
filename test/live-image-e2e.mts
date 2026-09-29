/**
 * Live e2e for the v1.0.9 image path, end to end: a real PNG through
 * ZenAdapter -> attachment service -> pi-ai -> fetch -> the Zen anonymous
 * lane, asserting the model answers from the pixels.
 *
 * Run: `node --experimental-strip-types test/live-image-e2e.mts`
 */
import zlib from 'node:zlib'
import { ZenAdapter } from '../src/adapter/zen-adapter.ts'

const t0 = Date.now()
const log = (tag: string): void => console.log(`[${Date.now() - t0}ms] ${tag}`)

let TABLE: number[] | null = null
function crc32(buf: Buffer): number {
  if (!TABLE) {
    TABLE = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      TABLE[n] = c
    }
  }
  let c = 0xffffffff
  for (const b of buf) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return c ^ 0xffffffff
}

/** A valid PNG, left half red and right half blue, so the answer is unambiguous. */
function makePng(W: number, Hh: number): Buffer {
  const raw = Buffer.alloc((W * 3 + 1) * Hh)
  let o = 0
  for (let y = 0; y < Hh; y++) {
    raw[o++] = 0
    for (let x = 0; x < W; x++) {
      const left = x < W / 2
      raw[o++] = left ? 200 : 20
      raw[o++] = left ? 30 : 40
      raw[o++] = left ? 40 : 210
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hh, 4)
  ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

const PNG = makePng(320, 240)
log(`test image: ${PNG.length} bytes, 320x240, valid PNG`)

const catalog = {
  list: () => ['space-bunny-free'],
  decision: () => ({ allowed: true, source: 'live' }),
  reasoningCapability: () => ({ reasoning: true, effortValues: [] }),
  inputModalities: () => ['text', 'image', 'video'],
} as never

const attachments = {
  readImageRequest: async (_ref: unknown, target: { width: number; height: number }) => ({
    data: new Uint8Array(PNG),
    mediaType: 'image/png' as const,
    bytes: PNG.byteLength,
    width: target.width,
    height: target.height,
  }),
  imageHostPath: () => 'C:/fake/normalized.png',
}

const adapter = new ZenAdapter(catalog, {
  resolveAttachments: () => attachments,
  firstEventMs: 30_000,
  bodyIdleMs: 60_000,
})

log(`resolveModel inputModalities: ${JSON.stringify(adapter.resolveModel('opencode2dsh', 'space-bunny-free').inputModalities)}`)

const stream = adapter.stream({
  provider: 'opencode2dsh',
  model: 'space-bunny-free',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What are the two colors in this image, left half then right half? Answer in 3 words.' },
        {
          type: 'image',
          attachment: {
            attachmentId: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
            mediaType: 'image/png',
            bytes: PNG.byteLength,
            width: 320,
            height: 240,
            name: 'red-blue.png',
          },
        },
      ],
    },
  ],
  temperature: 0,
  maxTokens: 128,
} as never)

let text = ''
let finish: { kind: string; failure?: { message: string } } | undefined
for await (const chunk of stream) {
  if (chunk.type === 'text-delta') text += chunk.text
  if (chunk.type === 'finish') {
    finish = chunk.reason as { kind: string; failure?: { message: string } }
    break
  }
}

log(`reply: ${JSON.stringify(text.slice(0, 200))}`)
if (finish?.kind === 'error') log(`FINISH ERROR: ${finish.failure?.message.slice(0, 300)}`)
const sawRed = /red/i.test(text)
const sawBlue = /blue/i.test(text)
log(sawRed && sawBlue ? 'IMAGE E2E PASS: the model answered from the pixels' : 'IMAGE E2E FAIL: colors not identified')
process.exit(sawRed && sawBlue ? 0 : 1)
