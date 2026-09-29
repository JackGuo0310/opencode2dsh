/**
 * Harness GenerateOptions -> pi-ai Context conversion (clean-room version of
 * dsh-llm-pi-ai's context conversion, covering both its text-only and
 * image-resolving paths).
 *
 * Which path runs is the adapter's decision, not the harness's: dsh-llm already
 * projected every image to placeholder text when the resolved model declares
 * text-only input modalities, so any image block that survives here belongs to
 * a model the route declared image-capable and must go upstream as real bytes.
 */

import {
  offloadedImageText,
  requestImageHandleText,
  requiredImageOffload,
  requestImageTarget,
  type ImageAccess,
  type ImageOccurrence,
  type ImageRef,
  type RequestImageVersion,
} from './images.ts'

/** Stable failure code the host's image-offload plugin retries on. */
export const IMAGE_OFFLOAD_REQUIRED_CODE = 'IMAGE_OFFLOAD_REQUIRED'

export interface HarnessTool {
  name: string
  description: string
  parameters: unknown
}

export type HarnessBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'image'; attachment: ImageRef; offloaded?: true; [key: string]: unknown }
  | { type: 'tool-result'; toolCallId: string; content: HarnessBlock[]; isError?: boolean; [key: string]: unknown }

export interface HarnessMessage {
  role: 'system' | 'user' | 'assistant'
  content: HarnessBlock[]
  source?: { kind: string; provider?: string; model?: string; callId?: string; [key: string]: unknown }
}

export interface HarnessGenerateOptions {
  provider: string
  model: string
  messages: HarnessMessage[]
  system?: string
  tools?: HarnessTool[]
  maxTokens?: number
  temperature?: number
  reasoningEffort?: string
  signal?: AbortSignal
  [key: string]: unknown
}

/** pi-ai message vocabulary (subset we emit). */
export type PiMessage =
  | { role: 'user'; content: string | PiContentBlock[]; timestamp: number }
  | {
      role: 'assistant'
      content: PiAssistantBlock[]
      api: 'openai-completions'
      provider: string
      model: string
      usage: PiUsage
      stopReason: 'stop' | 'toolUse'
      timestamp: number
    }
  | { role: 'toolResult'; toolCallId: string; toolName: string; content: PiContentBlock[]; isError: boolean; timestamp: number }

export type PiAssistantBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }

export type PiContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

export interface PiUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
}

export interface PiTool {
  name: string
  description: string
  parameters: unknown
}

export interface PiContext {
  systemPrompt?: string
  messages: PiMessage[]
  tools?: PiTool[]
}

export function zeroUsage(): PiUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function parseArguments(raw: string): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.length === 0) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed }
  } catch {
    return { raw }
  }
}

function toPiAssistant(message: HarnessMessage, providerId: string): Extract<PiMessage, { role: 'assistant' }> {
  const content: PiAssistantBlock[] = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        content.push({ type: 'text', text: block.text })
        break
      case 'reasoning':
        content.push({ type: 'thinking', thinking: block.text })
        break
      case 'tool-call':
        content.push({ type: 'toolCall', id: block.id, name: block.name, arguments: parseArguments(block.arguments) })
        break
      case 'image':
        // Assistant-side image output is forward compatibility in the harness
        // vocabulary; no current adapter declares it, and pi-ai has no
        // assistant image block to replay into.
        throw new Error('opencode2dsh: assistant image output cannot be replayed to a text-only model')
      default:
        break
    }
  }
  const source = message.source
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: source?.kind === 'model' && typeof source.provider === 'string' ? source.provider : providerId,
    model: source?.kind === 'model' && typeof source.model === 'string' ? source.model : providerId,
    usage: zeroUsage(),
    stopReason: content.some((block) => block.type === 'toolCall') ? 'toolUse' : 'stop',
    timestamp: 0,
  }
}

/** Anything in typed content carrying a durable image reference. */
export function contentHasImage(content: readonly unknown[]): boolean {
  for (const block of content) {
    const candidate = block as { type?: unknown; attachment?: unknown }
    if (candidate?.type === 'image' && candidate.attachment !== undefined) return true
  }
  return false
}

export function anyMessageHasImage(messages: readonly HarnessMessage[]): boolean {
  for (const message of messages) {
    if (contentHasImage(message.content)) return true
  }
  return false
}

function flattenText(message: HarnessMessage): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('')
}

function toolResultText(blocks: HarnessBlock[]): string {
  return blocks
    .map((block) => (block.type === 'text' ? block.text : block.type === 'tool-result' ? toolResultText(block.content) : ''))
    .join('')
}

function isImageBlock(block: HarnessBlock): block is Extract<HarnessBlock, { type: 'image' }> {
  return block.type === 'image' && (block as { attachment?: unknown }).attachment !== undefined
}

/**
 * Walk one typed content list, descending into tool-result bodies: an image a
 * tool returned is as transportable as one the user attached, and both cost the
 * same request bytes.
 */
function visitImageBlocks(blocks: readonly HarnessBlock[], visit: (block: Extract<HarnessBlock, { type: 'image' }>) => void): void {
  for (const block of blocks) {
    if (isImageBlock(block)) visit(block)
    else if (block.type === 'tool-result') visitImageBlocks(block.content, visit)
  }
}

/** The durable attachment service seam the image path resolves bytes through. */
export interface ImageRequestContext {
  attachments: {
    readImageRequest(ref: ImageRef, target: { width: number; height: number; maxBytes: number }, signal?: AbortSignal): Promise<RequestImageVersion>
  }
  /** Resolve the read-only execution-world path for one durable reference. */
  resolveImageAccess?: (ref: ImageRef) => ImageAccess | undefined
  /** Request-level bound on the base64 payload of retained images. */
  maxRequestImageBytes?: number
  /** Per-image geometry and encoded-byte budget. */
  requestImagePolicy?: { maxPixels: number; maxBytes: number }
  /** Occurrence cap; absent leaves the count unbounded. */
  maxRequestImages?: number
}

/** One image block prepared for the wire, with the text that describes it. */
interface PreparedImage {
  text: string
  image: { type: 'image'; data: string; mimeType: string }
  /** Raw encoded length of the request version, before base64 expansion. */
  versionBytes: number
}

async function prepareRequestImages(
  messages: readonly HarnessMessage[],
  images: ImageRequestContext,
  signal: AbortSignal | undefined,
): Promise<Map<string, PreparedImage>> {
  const refs = new Map<string, ImageRef>()
  for (const message of messages) {
    visitImageBlocks(message.content, (block) => {
      if (block.offloaded === true) return
      refs.set(block.attachment.attachmentId, block.attachment)
    })
  }
  const policy = images.requestImagePolicy ?? { maxPixels: 2048 * 2048, maxBytes: 1024 * 1024 }
  const prepared = new Map<string, PreparedImage>()
  await Promise.all(
    [...refs.values()].map(async (ref) => {
      const version = await images.attachments.readImageRequest(ref, requestImageTarget(ref, policy), signal)
      prepared.set(ref.attachmentId, {
        text: requestImageHandleText(ref, version, images.resolveImageAccess?.(ref)),
        image: { type: 'image', data: Buffer.from(version.data).toString('base64'), mimeType: version.mediaType },
        versionBytes: version.bytes,
      })
    }),
  )
  return prepared
}

/** Typed content -> pi-ai user/tool-result content. A retained image becomes
 * its handle text plus real bytes; an offloaded one becomes placeholder text
 * alone. Pure text collapses to the plain string form the wire prefers, so a
 * text-only conversation serializes exactly as it did before. */
function userContent(
  blocks: readonly HarnessBlock[],
  prepared: Map<string, PreparedImage> | undefined,
  resolveImageAccess: ((ref: ImageRef) => ImageAccess | undefined) | undefined,
): string | PiContentBlock[] {
  const content = typedUserContent(blocks, prepared, resolveImageAccess)
  return content.every((block) => block.type === 'text') ? content.map((block) => block.text).join('') : content
}

/** Same walk, without the string collapse: tool results always carry blocks.
 *
 * `descendToolResults` separates the two call sites. At message level a
 * tool-result block is a sibling message's content, so flattening its text here
 * would duplicate it as a user turn; inside a tool result, a nested result's
 * text is part of the same payload. */
function typedUserContent(
  blocks: readonly HarnessBlock[],
  prepared: Map<string, PreparedImage> | undefined,
  resolveImageAccess: ((ref: ImageRef) => ImageAccess | undefined) | undefined,
  descendToolResults = false,
): PiContentBlock[] {
  const content: PiContentBlock[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      if (block.text.length > 0) content.push({ type: 'text', text: block.text })
      continue
    }
    if (block.type === 'tool-result') {
      // The tool result's own message carries this content separately; a nested
      // result's text is flattened exactly as the text-only path flattens it.
      if (!descendToolResults) continue
      const nested = toolResultText(block.content)
      if (nested.length > 0) content.push({ type: 'text', text: nested })
      continue
    }
    if (!isImageBlock(block)) continue
    if (block.offloaded === true) {
      content.push({ type: 'text', text: offloadedImageText(block.attachment, resolveImageAccess?.(block.attachment)) })
      continue
    }
    const version = prepared?.get(block.attachment.attachmentId)
    if (!version) continue
    content.push({ type: 'text', text: version.text })
    content.push(version.image)
  }
  return content
}

/** Replace every offloaded occurrence in the history with its placeholder. */
function projectOffloadedImages(
  messages: readonly HarnessMessage[],
  placeholder: (ref: ImageRef) => string,
): HarnessMessage[] {
  if (!messages.some((message) => hasOffloaded(message.content))) return [...messages]
  return messages.map((message) => {
    if (!hasOffloaded(message.content)) return message
    return { ...message, content: replaceOffloaded(message.content, placeholder) }
  })
}

function hasOffloaded(blocks: readonly HarnessBlock[]): boolean {
  let found = false
  visitImageBlocks(blocks, (block) => {
    if (block.offloaded === true) found = true
  })
  return found
}

function replaceOffloaded(blocks: readonly HarnessBlock[], placeholder: (ref: ImageRef) => string): HarnessBlock[] {
  return blocks.map((block) => {
    if (isImageBlock(block)) {
      return block.offloaded === true ? { type: 'text' as const, text: placeholder(block.attachment) } : block
    }
    if (block.type === 'tool-result' && hasOffloaded(block.content)) {
      return { ...block, content: replaceOffloaded(block.content, placeholder) }
    }
    return block
  })
}

/** An error the host's image-offload plugin recognises and retries on. */
export class ImageOffloadRequiredError extends Error {
  readonly failure: { message: string; code: string; offloadImages: number }

  constructor(maxBytes: number, offloadImages: number) {
    super(
      `opencode2dsh request images exceed the ${maxBytes}-byte base64 bound; ${offloadImages} more oldest occurrence(s) must be offloaded.`,
    )
    this.failure = { message: this.message, code: IMAGE_OFFLOAD_REQUIRED_CODE, offloadImages }
  }
}

/**
 * Convert the harness conversation into a pi-ai Context.
 *
 * Text-only path: user content collapses to a plain string, tool results become
 * toolResult messages, assistant history replays as pi-ai assistant messages.
 *
 * Image path (only reached when the route declared image input): durable
 * attachments are resolved to request versions first, the request-wide base64
 * bound is checked, and every retained occurrence ships as handle text plus
 * real image bytes.
 */
export function toPiContext(options: HarnessGenerateOptions): PiContext
export function toPiContext(options: HarnessGenerateOptions, images: ImageRequestContext): Promise<PiContext>
export function toPiContext(options: HarnessGenerateOptions, images?: ImageRequestContext): PiContext | Promise<PiContext> {
  if (images === undefined) return toTextOnlyPiContext(options)
  return toImagePiContext(options, images)
}

function assemble(
  options: HarnessGenerateOptions,
  providerId: string,
  messages: readonly HarnessMessage[],
  contentOf: (message: HarnessMessage) => string | PiContentBlock[] | null,
  toolContentOf: (result: Extract<HarnessBlock, { type: 'tool-result' }>) => PiContentBlock[],
): PiContext {
  const toolNames = new Map<string, string>()
  const converted: PiMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      const text = flattenText(message)
      if (text.length > 0) converted.push({ role: 'user', content: text, timestamp: 0 })
      continue
    }
    if (message.role === 'assistant') {
      const assistant = toPiAssistant(message, providerId)
      for (const block of assistant.content) {
        if (block.type === 'toolCall') toolNames.set(block.id, block.name)
      }
      converted.push(assistant)
      continue
    }
    const text = contentOf(message)
    // null = this turn has no user text of its own (a pure tool-result turn);
    // its whole content is the toolResult messages that follow.
    if (text !== null && (typeof text === 'string' ? text.length > 0 : true)) {
      converted.push({ role: 'user', content: text, timestamp: 0 })
    }
    for (const block of message.content) {
      if (block.type !== 'tool-result') continue
      converted.push({
        role: 'toolResult',
        toolCallId: block.toolCallId,
        toolName: toolNames.get(block.toolCallId) ?? 'unknown',
        content: toolContentOf(block),
        isError: block.isError ?? false,
        timestamp: 0,
      })
    }
  }
  const context: PiContext = { messages: converted }
  if (typeof options.system === 'string' && options.system.length > 0) context.systemPrompt = options.system
  const tools = options.tools?.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
  if (tools && tools.length > 0) context.tools = tools
  return context
}

function toTextOnlyPiContext(options: HarnessGenerateOptions): PiContext {
  return assemble(
    options,
    options.provider,
    options.messages,
    (message) => {
      const text = flattenText(message)
      const results = message.content.filter((block) => block.type === 'tool-result')
      // A turn carrying only tool results has no user text of its own; the
      // toolResult messages that follow are its whole content.
      return results.length === 0 || text.length > 0 ? text : null
    },
    (result) => [{ type: 'text', text: toolResultText(result.content) || '(no output)' }],
  )
}

async function toImagePiContext(options: HarnessGenerateOptions, images: ImageRequestContext): Promise<PiContext> {
  const resolveImageAccess = images.resolveImageAccess
  const prepared = await prepareRequestImages(options.messages, images, options.signal)
  const maxBytes = images.maxRequestImageBytes
  if (maxBytes !== undefined) {
    const offload = requiredImageOffload(
      options.messages,
      { maxBytes, ...(images.maxRequestImages === undefined ? {} : { maxImages: images.maxRequestImages }) },
      (block) => prepared.get(block.attachment.attachmentId)?.versionBytes ?? 0,
    )
    if (offload > 0) throw new ImageOffloadRequiredError(maxBytes, offload)
  }
  const exact = projectOffloadedImages(options.messages, (ref) => offloadedImageText(ref, resolveImageAccess?.(ref)))
  return assemble(
    options,
    options.provider,
    exact,
    (message) => userContent(message.content, prepared, resolveImageAccess),
    (result) => typedUserContent(result.content, prepared, resolveImageAccess, true),
  )
}

/**
 * The Zen anonymous free lane (live-probed 2026-09-18) rejects chat bodies
 * that do not carry an agent shape: HTTP 403 FreeTierError unless the body
 * streams (`stream: true`) and its `tools` array includes function tools
 * named "bash" AND "read" — descriptions, parameters and every header
 * (User-Agent included) go uninspected. pi-ai always streams, so the
 * chat-path gap is tools only: plain conversations carry none.
 */
export const FREE_LANE_GATE_TOOL_NAMES = ['bash', 'read'] as const

export interface FreeLaneGateTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export function freeLaneGateTool(name: (typeof FREE_LANE_GATE_TOOL_NAMES)[number]): FreeLaneGateTool {
  return {
    type: 'function',
    function: {
      name,
      description: 'Reserved for the host runtime; do not call it.',
      parameters: { type: 'object', properties: {} },
    },
  }
}

/**
 * Rewrite an outgoing chat-completions payload so it satisfies the free-lane
 * agent-shape gate (wired through pi-ai's onPayload). Appends only the gate
 * tools the payload is missing; when the context carried no tools at all,
 * tool_choice 'none' keeps the model from ever calling the injected stubs,
 * while client-provided tool choices are preserved untouched. Returns
 * undefined when the payload already satisfies the gate or is not a
 * chat-completions body (pi-ai keeps the original in that case).
 */
export function ensureFreeLaneShape(payload: unknown): unknown | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const body = payload as Record<string, unknown>
  if (!Array.isArray(body.messages)) return undefined
  const tools = Array.isArray(body.tools) ? (body.tools as unknown[]) : []
  const names = new Set(
    tools.map((tool) => {
      const fn = typeof tool === 'object' && tool !== null ? (tool as { function?: { name?: unknown } }).function : undefined
      return typeof fn === 'object' && fn !== null ? fn.name : undefined
    }),
  )
  const missing = FREE_LANE_GATE_TOOL_NAMES.filter((name) => !names.has(name))
  if (missing.length === 0) return undefined
  const next: Record<string, unknown> = { ...body }
  next.tools = [...tools, ...missing.map((name) => freeLaneGateTool(name))]
  if (tools.length === 0) next.tool_choice = 'none'
  return next
}
