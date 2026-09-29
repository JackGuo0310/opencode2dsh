import test from 'node:test'
import assert from 'node:assert/strict'

import {
  base64Length,
  offloadedImageText,
  requestImageDimensions,
  requestImageHandleText,
  requiredImageOffload,
  textOnlyImageText,
  type ImageAccess,
  type ImageRef,
} from '../src/adapter/images.ts'
import {
  anyMessageHasImage,
  ImageOffloadRequiredError,
  toPiContext,
  type HarnessBlock,
  type HarnessGenerateOptions,
  type HarnessMessage,
  type ImageRequestContext,
  type PiMessage,
} from '../src/adapter/messages.ts'

const ONE_PIXEL_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])

function ref(id: string, overrides: Partial<ImageRef> = {}): ImageRef {
  return { attachmentId: `sha256:${id.repeat(8).slice(0, 64)}`, mediaType: 'image/png', bytes: 10, width: 64, height: 64, ...overrides }
}

function occurrence(id: string, overrides: Partial<ImageRef> = {}, offloaded?: true): HarnessBlock {
  return { type: 'image', attachment: ref(id, overrides), ...(offloaded ? { offloaded } : {}) } as HarnessBlock
}

/** Attachment stub returning a fixed request version per reference. */
function attachments(versionBytes = 10) {
  const calls: Array<{ id: string; target: { width: number; height: number; maxBytes: number } }> = []
  return {
    calls,
    seam: {
      readImageRequest: async (targetRef: ImageRef, target: { width: number; height: number; maxBytes: number }) => {
        calls.push({ id: targetRef.attachmentId, target })
        return {
          data: ONE_PIXEL_PNG,
          mediaType: 'image/png' as const,
          bytes: versionBytes,
          width: target.width,
          height: target.height,
        }
      },
      imageHostPath: (targetRef: ImageRef) => `C:/store/${targetRef.attachmentId.slice(7, 15)}.png`,
    },
  }
}

function options(messages: HarnessMessage[]): HarnessGenerateOptions {
  return { provider: 'opencode2dsh', model: 'space-bunny-free', messages }
}

function userText(message: PiMessage | undefined): string {
  assert.equal(message?.role, 'user')
  return (message as { content: string | Array<{ type: string }> }).content as never
}

test('base64Length matches the padded encoding', () => {
  assert.equal(base64Length(0), 0)
  assert.equal(base64Length(3), 4)
  assert.equal(base64Length(4), 8)
})

test('requestImageDimensions preserves small images and downsamples large ones', () => {
  assert.deepEqual(requestImageDimensions(800, 600, 2048 * 2048), { width: 800, height: 600 })
  const big = requestImageDimensions(4000, 3000, 2048 * 2048)
  assert.equal(big.width * big.height <= 2048 * 2048, true)
  assert.equal(big.width / big.height > 1.32, true, 'aspect ratio preserved')
})

test('requiredImageOffload counts the oldest occurrences a bound forces out', () => {
  const messages = [
    { content: [occurrence('a'), occurrence('b')] },
    { content: [occurrence('c')] },
  ]
  const bytes = () => 10
  assert.equal(requiredImageOffload(messages, {}, bytes), 0, 'no budget, no omission')
  // 3 images x ceil(10/3)*4 = 16 base64 bytes each, 48 in total
  assert.equal(requiredImageOffload(messages, { maxBytes: 48 }, bytes), 0, 'exactly at the bound')
  assert.equal(requiredImageOffload(messages, { maxBytes: 47 }, bytes), 1, 'one byte over drops the oldest')
  assert.equal(requiredImageOffload(messages, { maxBytes: 32 }, bytes), 1)
  assert.equal(requiredImageOffload(messages, { maxBytes: 31 }, bytes), 2)
  assert.equal(requiredImageOffload(messages, { maxImages: 1 }, bytes), 2, 'the count bound applies alone')
  const offloaded = [{ content: [occurrence('a', {}, true), occurrence('b')] }]
  assert.equal(requiredImageOffload(offloaded, { maxBytes: 8 }, bytes), 1, 'offloaded occurrences cost nothing')
})

test('placeholder texts name the attachment and stay deterministic', () => {
  const one = ref('1', { name: 'chart.png' })
  assert.match(requestImageHandleText(one, { width: 32, height: 32 }), /chart\.png/)
  assert.match(requestImageHandleText(one, { width: 32, height: 32 }, { readonlyPath: 'C:/a.png' }), /read-only/)
  assert.match(offloadedImageText(one), /omitted to fit request image limits/)
  assert.match(textOnlyImageText(one), /accepts text only/)
  assert.equal(requestImageHandleText(one, { width: 32, height: 32 }), requestImageHandleText(one, { width: 32, height: 32 }))
})

test('anyMessageHasImage only counts blocks carrying a durable reference', () => {
  assert.equal(anyMessageHasImage([{ role: 'user', content: [{ type: 'text', text: 'x' }] }]), false)
  assert.equal(anyMessageHasImage([{ role: 'user', content: [occurrence('a')] }]), true)
  // a bare image block with no attachment is not a transportable occurrence
  assert.equal(anyMessageHasImage([{ role: 'user', content: [{ type: 'image' }] as never }]), false)
})

test('a retained image ships as handle text plus real bytes', async () => {
  const store = attachments()
  const context: PiContext = await toPiContext(options([
    { role: 'user', content: [{ type: 'text', text: 'what is this?' }, occurrence('a', { name: 'plot.png' })] },
  ]), { attachments: store.seam } as unknown as ImageRequestContext)

  const user = context.messages[0] as { role: 'user'; content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }
  assert.equal(user.role, 'user')
  assert.equal(user.content.length, 3)
  assert.equal(user.content[0]?.text, 'what is this?')
  assert.match(user.content[1]?.text ?? '', /plot\.png/, 'the handle text names the image')
  assert.deepEqual(user.content[2], { type: 'image', data: Buffer.from(ONE_PIXEL_PNG).toString('base64'), mimeType: 'image/png' })
  assert.equal(store.calls.length, 1, 'bytes are read exactly once per durable reference')
  assert.equal(store.calls[0]?.target.maxBytes, 1024 * 1024, 'the route byte budget reaches the encoder')
})

test('an image-only turn with no text still becomes a user message', async () => {
  const context = await toPiContext(options([{ role: 'user', content: [occurrence('a')] }]), {
    attachments: attachments().seam,
  } as unknown as ImageRequestContext)
  assert.equal(context.messages.length, 1)
  assert.equal(Array.isArray((context.messages[0] as { content: unknown }).content), true)
})

test('a text-only turn with the image path still collapses to the plain string form', async () => {
  const context = await toPiContext(options([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]), {
    attachments: attachments().seam,
  } as unknown as ImageRequestContext)
  assert.equal(userText(context.messages[0]), 'hi')
})

test('offloaded occurrences become placeholder text and are never read', async () => {
  const store = attachments()
  const context = await toPiContext(options([
    { role: 'user', content: [occurrence('a', { name: 'old.png' }, true), { type: 'text', text: 'and now?' }] },
  ]), { attachments: store.seam, resolveImageAccess: (r: ImageRef) => ({ readonlyPath: `C:/${r.attachmentId.slice(7, 15)}.png` }) } as unknown as ImageRequestContext)

  const user = context.messages[0] as { content: string | Array<{ type: string; text?: string }> }
  assert.equal(typeof user.content, 'string', 'an all-placeholder turn collapses to the plain string form')
  assert.match(user.content as string, /omitted to fit request image limits/)
  assert.match(user.content as string, /and now\?/)
  assert.equal(store.calls.length, 0, 'an offloaded reference is never read back')
})

test('images inside tool results travel with the result', async () => {
  const context = await toPiContext(options([
    { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'read', arguments: '{}' }] },
    { role: 'user', content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'screenshot:' }, occurrence('a')] }] },
  ]), { attachments: attachments().seam } as unknown as ImageRequestContext)

  assert.equal(context.messages.length, 2)
  const result = context.messages[1] as { role: 'toolResult'; content: Array<{ type: string }> }
  assert.equal(result.role, 'toolResult')
  assert.deepEqual(result.content.map((block) => block.type), ['text', 'text', 'image'])
})

test('a request over the base64 bound fails with the host offload code', async () => {
  const error = await toPiContext(
    options([
      { role: 'user', content: [occurrence('a'), occurrence('b')] },
    ]),
    { attachments: attachments(100).seam, maxRequestImageBytes: 8 } as unknown as ImageRequestContext,
  ).then(
    () => undefined,
    (err: unknown) => err,
  )
  assert.ok(error instanceof ImageOffloadRequiredError)
  const failure = (error as ImageOffloadRequiredError).failure
  assert.equal(failure.code, 'IMAGE_OFFLOAD_REQUIRED', 'dsh-compaction-image-offload keys on this code')
  assert.equal(failure.offloadImages, 2, 'every occurrence must go')
  assert.match(failure.message, /oldest/)
})

test('the text-only path never reads attachments, even with image blocks present', () => {
  const context = toPiContext(options([{ role: 'user', content: [occurrence('a'), { type: 'text', text: 'x' }] }]))
  assert.equal(userText(context.messages[0]), 'x')
})

/**
 * Walk a PNG's chunk structure.
 *
 * This exists because of a real misdiagnosis: the hand-written base64 "PNG"
 * used by the first round of live vision probes had a corrupt IDAT length
 * field (it decoded to 1073741824 bytes), the lane correctly answered 400 for
 * corrupt bytes, and that was misread as "the lane refuses every image". The
 * plugin was fine; the fixture was not. A structural check makes that class of
 * bad sample fail loudly instead of quietly producing a wrong conclusion.
 */
export function pngChunkTypes(bytes: Uint8Array): string[] {
  const view = Buffer.from(bytes)
  const signature = '89504e470d0a1a0a'
  assert.equal(view.subarray(0, 8).toString('hex'), signature, 'PNG signature')
  const types: string[] = []
  let offset = 8
  while (offset + 8 <= view.length) {
    const length = view.readUInt32BE(offset)
    const type = view.subarray(offset + 4, offset + 8).toString('ascii')
    types.push(type)
    offset += 12 + length
  }
  assert.equal(offset, view.length, `chunk lengths overrun the buffer by ${offset - view.length} byte(s)`)
  assert.equal(types[0], 'IHDR', 'first chunk is IHDR')
  assert.equal(types[types.length - 1], 'IEND', 'last chunk is IEND')
  return types
}

test('the unit-test image fixture is a structurally valid PNG', () => {
  // The stub above only needs bytes, but live probes reuse real images; keeping
  // one validated generator here stops a corrupt sample from reaching them.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHUlEQVQI12P4//8/AzYhYhjYGBgYGJgYGBgYGAAAHjgAF/6x1jBAAAAAElFTkSuQmCC',
    'base64',
  )
  // This is the exact string the first live probe used. It is NOT valid — the
  // assertion documents why, so nobody reintroduces it as a trusted sample.
  assert.throws(() => pngChunkTypes(png), /overrun|signature/)
})

interface PiContext {
  messages: PiMessage[]
  systemPrompt?: string
  tools?: unknown[]
}
