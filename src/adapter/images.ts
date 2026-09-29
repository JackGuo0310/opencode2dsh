/**
 * Request-image policy for the Zen lane: geometry, byte accounting, offload
 * arithmetic, and the model-facing placeholder text.
 *
 * Clean-room port of the request-image surface dsh-llm-pi-ai uses
 * (@deepseek-ai/dsh-llm content.ts + @deepseek-ai/dsh-attachment
 * request-projection.ts). The plugin keeps its own copy so the host package
 * stays an optional peer: the wire behaviour must be identical, but an
 * unavailable host must not break plugin import.
 *
 * Scope: the harness carries exactly one binary modality (raster image). A
 * file block never reaches an adapter — dsh-llm projects every file occurrence
 * to deterministic handle text for all routes — so video/PDF/audio are text
 * by host contract, not by this module's choice.
 */

/** Durable normalized image reference (dsh-attachment ImageAttachmentRef subset). */
export interface ImageRef {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
  name?: string
}

/** One request-scoped image block as the harness delivers it. */
export interface ImageOccurrence {
  type: 'image'
  attachment: ImageRef
  offloaded?: true
}

/** Encoded request version of one normalized attachment. */
export interface RequestImageVersion {
  data: Uint8Array
  mediaType: string
  bytes: number
  width: number
  height: number
}

/**
 * Request-level bound on the base64 payload of retained images. Every image in
 * history is re-encoded into every request body, so an unbounded conversation
 * eventually exceeds a gateway request cap and the session can never complete
 * another request. 20MiB admits fifteen 1MiB request versions after base64
 * expansion and leaves room for prompts, history, tools and JSON.
 */
export const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024

/**
 * Total-pixel budget per image. 2048*2048 preserves the complete normalized
 * attachment the host produces, so the common case never resamples.
 */
export const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048

/** Encoded-byte target for one request image, before base64 expansion. */
export const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024

/** Image occurrence cap one request may carry (independent of the byte bound). */
export const DEFAULT_MAX_REQUEST_IMAGES = 32

/** base64 encoded length of `bytes` raw bytes. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4
}

/**
 * Aspect-preserving integer dimensions within a hard total-pixel budget.
 * Inward rounding; small images are never enlarged.
 */
export function requestImageDimensions(width: number, height: number, maxPixels: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !(maxPixels > 0)) return { width, height }
  const pixels = width * height
  if (pixels <= maxPixels) return { width, height }
  const scale = Math.sqrt(maxPixels / pixels)
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

/** Deterministic request target for one source under the route budgets. */
export function requestImageTarget(ref: ImageRef, budget: { maxPixels: number; maxBytes: number }): { width: number; height: number; maxBytes: number } {
  return { ...requestImageDimensions(ref.width, ref.height, budget.maxPixels), maxBytes: budget.maxBytes }
}

/** Budget a route enforces over the retained occurrences of one request. */
export interface ImageRequestBudget {
  /** Base64 length bound across the whole request. */
  maxBytes?: number
  /** Occurrence cap across the whole request. */
  maxImages?: number
}

function visitImageBlocks<T>(content: readonly T[], visit: (block: T) => void): void {
  for (const block of content) {
    const candidate = block as { type?: unknown }
    if (candidate?.type === 'image') visit(block)
  }
}

/**
 * How many oldest retained occurrences must be dropped before the request
 * fits. Mirrors the host's offloadedImagePrefixCount: the byte excess is
 * rounded up to the removal quantum and satisfied by consuming occurrences
 * oldest-first, so the answer is deterministic for one request.
 */
export function requiredImageOffload(
  messages: ReadonlyArray<{ content: readonly unknown[] }>,
  budget: ImageRequestBudget,
  versionBytes: (block: ImageOccurrence) => number,
): number {
  const lengths: number[] = []
  for (const message of messages) {
    visitImageBlocks(message.content, (block) => {
      const occurrence = block as ImageOccurrence
      if (occurrence.offloaded === true) return
      lengths.push(base64Length(versionBytes(occurrence)))
    })
  }
  if (lengths.length === 0) return 0
  const total = lengths.reduce((sum, bytes) => sum + bytes, 0)
  const excessCount = budget.maxImages === undefined ? 0 : Math.max(0, lengths.length - budget.maxImages)
  const excessBytes = budget.maxBytes === undefined ? 0 : Math.max(0, total - budget.maxBytes)
  if (excessCount === 0 && excessBytes === 0) return 0
  let count = 0
  let removedBytes = 0
  for (const bytes of lengths) {
    const countSatisfied = count >= excessCount
    const bytesSatisfied = excessBytes === 0 || removedBytes >= excessBytes
    if (countSatisfied && bytesSatisfied) break
    removedBytes += bytes
    count += 1
  }
  return count
}

function imageIdentity(ref: ImageRef): string {
  return ref.name === undefined ? ref.attachmentId : `${ref.name} (${ref.attachmentId})`
}

function extension(mediaType: string): string {
  switch (mediaType) {
    case 'image/png':
      return '.png'
    case 'image/jpeg':
      return '.jpg'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    default:
      return ''
  }
}

/** Read-only normalized path the model may use to re-read the original. */
export interface ImageAccess {
  readonlyPath: string
}

function normalizedAccessText(ref: ImageRef, access: ImageAccess): string {
  return ` Normalized copy (read-only; may be resized or re-encoded): "${access.readonlyPath}" (${ref.width}x${ref.height}px, ${ref.mediaType}). Source dimensions, format, and byte size may differ. Copy to a writable path ending in ${extension(ref.mediaType)} before editing.`
}

/**
 * Model-facing handle for one retained request image. Sent as text beside the
 * image itself, so the model can cite the attachment and re-read the
 * normalized copy on demand.
 */
export function requestImageHandleText(ref: ImageRef, version: Pick<RequestImageVersion, 'width' | 'height'>, access?: ImageAccess): string {
  const preview = `Image ${imageIdentity(ref)}; request preview ${version.width}x${version.height}px.`
  return access === undefined
    ? `${preview} It may be resized or re-encoded; source dimensions, format, and byte size may differ.`
    : preview + normalizedAccessText(ref, access)
}

/** Placeholder for an occurrence the request byte budget dropped. */
export function offloadedImageText(ref: ImageRef, access?: ImageAccess): string {
  const identity = `image omitted to fit request image limits; ${imageIdentity(ref)}.`
  return access === undefined
    ? `[${identity} No local normalized image path is available; ask the user to attach it again if needed.]`
    : `[${identity}${normalizedAccessText(ref, access)}]`
}

/** Placeholder used when the model accepts no image input at all. */
export function textOnlyImageText(ref: ImageRef): string {
  return `[image omitted because this model accepts text only; attachment sha256:${ref.attachmentId.slice(7, 15)}]`
}
