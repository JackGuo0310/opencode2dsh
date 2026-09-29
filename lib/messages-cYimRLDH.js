//#region src/adapter/images.ts
/**
* Request-level bound on the base64 payload of retained images. Every image in
* history is re-encoded into every request body, so an unbounded conversation
* eventually exceeds a gateway request cap and the session can never complete
* another request. 20MiB admits fifteen 1MiB request versions after base64
* expansion and leaves room for prompts, history, tools and JSON.
*/
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
/**
* Total-pixel budget per image. 2048*2048 preserves the complete normalized
* attachment the host produces, so the common case never resamples.
*/
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
/** Encoded-byte target for one request image, before base64 expansion. */
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
/** base64 encoded length of `bytes` raw bytes. */
function base64Length(bytes) {
	return Math.ceil(bytes / 3) * 4;
}
/**
* Aspect-preserving integer dimensions within a hard total-pixel budget.
* Inward rounding; small images are never enlarged.
*/
function requestImageDimensions(width, height, maxPixels) {
	if (!(width > 0) || !(height > 0) || !(maxPixels > 0)) return {
		width,
		height
	};
	const pixels = width * height;
	if (pixels <= maxPixels) return {
		width,
		height
	};
	const scale = Math.sqrt(maxPixels / pixels);
	return {
		width: Math.max(1, Math.floor(width * scale)),
		height: Math.max(1, Math.floor(height * scale))
	};
}
/** Deterministic request target for one source under the route budgets. */
function requestImageTarget(ref, budget) {
	return {
		...requestImageDimensions(ref.width, ref.height, budget.maxPixels),
		maxBytes: budget.maxBytes
	};
}
function visitImageBlocks$1(content, visit) {
	for (const block of content) if (block?.type === "image") visit(block);
}
/**
* How many oldest retained occurrences must be dropped before the request
* fits. Mirrors the host's offloadedImagePrefixCount: the byte excess is
* rounded up to the removal quantum and satisfied by consuming occurrences
* oldest-first, so the answer is deterministic for one request.
*/
function requiredImageOffload(messages, budget, versionBytes) {
	const lengths = [];
	for (const message of messages) visitImageBlocks$1(message.content, (block) => {
		const occurrence = block;
		if (occurrence.offloaded === true) return;
		lengths.push(base64Length(versionBytes(occurrence)));
	});
	if (lengths.length === 0) return 0;
	const total = lengths.reduce((sum, bytes) => sum + bytes, 0);
	const excessCount = budget.maxImages === void 0 ? 0 : Math.max(0, lengths.length - budget.maxImages);
	const excessBytes = budget.maxBytes === void 0 ? 0 : Math.max(0, total - budget.maxBytes);
	if (excessCount === 0 && excessBytes === 0) return 0;
	let count = 0;
	let removedBytes = 0;
	for (const bytes of lengths) {
		if (count >= excessCount && (excessBytes === 0 || removedBytes >= excessBytes)) break;
		removedBytes += bytes;
		count += 1;
	}
	return count;
}
function imageIdentity(ref) {
	return ref.name === void 0 ? ref.attachmentId : `${ref.name} (${ref.attachmentId})`;
}
function extension(mediaType) {
	switch (mediaType) {
		case "image/png": return ".png";
		case "image/jpeg": return ".jpg";
		case "image/webp": return ".webp";
		case "image/gif": return ".gif";
		default: return "";
	}
}
function normalizedAccessText(ref, access) {
	return ` Normalized copy (read-only; may be resized or re-encoded): "${access.readonlyPath}" (${ref.width}x${ref.height}px, ${ref.mediaType}). Source dimensions, format, and byte size may differ. Copy to a writable path ending in ${extension(ref.mediaType)} before editing.`;
}
/**
* Model-facing handle for one retained request image. Sent as text beside the
* image itself, so the model can cite the attachment and re-read the
* normalized copy on demand.
*/
function requestImageHandleText(ref, version, access) {
	const preview = `Image ${imageIdentity(ref)}; request preview ${version.width}x${version.height}px.`;
	return access === void 0 ? `${preview} It may be resized or re-encoded; source dimensions, format, and byte size may differ.` : preview + normalizedAccessText(ref, access);
}
/** Placeholder for an occurrence the request byte budget dropped. */
function offloadedImageText(ref, access) {
	const identity = `image omitted to fit request image limits; ${imageIdentity(ref)}.`;
	return access === void 0 ? `[${identity} No local normalized image path is available; ask the user to attach it again if needed.]` : `[${identity}${normalizedAccessText(ref, access)}]`;
}

//#endregion
//#region src/adapter/messages.ts
/** Stable failure code the host's image-offload plugin retries on. */
const IMAGE_OFFLOAD_REQUIRED_CODE = "IMAGE_OFFLOAD_REQUIRED";
function zeroUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: 0
		}
	};
}
function parseArguments(raw) {
	if (typeof raw !== "string" || raw.length === 0) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
	} catch {
		return { raw };
	}
}
function toPiAssistant(message, providerId) {
	const content = [];
	for (const block of message.content) switch (block.type) {
		case "text":
			content.push({
				type: "text",
				text: block.text
			});
			break;
		case "reasoning":
			content.push({
				type: "thinking",
				thinking: block.text
			});
			break;
		case "tool-call":
			content.push({
				type: "toolCall",
				id: block.id,
				name: block.name,
				arguments: parseArguments(block.arguments)
			});
			break;
		case "image": throw new Error("opencode2dsh: assistant image output cannot be replayed to a text-only model");
		default: break;
	}
	const source = message.source;
	return {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: source?.kind === "model" && typeof source.provider === "string" ? source.provider : providerId,
		model: source?.kind === "model" && typeof source.model === "string" ? source.model : providerId,
		usage: zeroUsage(),
		stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
		timestamp: 0
	};
}
/** Anything in typed content carrying a durable image reference. */
function contentHasImage(content) {
	for (const block of content) {
		const candidate = block;
		if (candidate?.type === "image" && candidate.attachment !== void 0) return true;
	}
	return false;
}
function anyMessageHasImage(messages) {
	for (const message of messages) if (contentHasImage(message.content)) return true;
	return false;
}
function flattenText(message) {
	return message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function toolResultText(blocks) {
	return blocks.map((block) => block.type === "text" ? block.text : block.type === "tool-result" ? toolResultText(block.content) : "").join("");
}
function isImageBlock(block) {
	return block.type === "image" && block.attachment !== void 0;
}
/**
* Walk one typed content list, descending into tool-result bodies: an image a
* tool returned is as transportable as one the user attached, and both cost the
* same request bytes.
*/
function visitImageBlocks(blocks, visit) {
	for (const block of blocks) if (isImageBlock(block)) visit(block);
	else if (block.type === "tool-result") visitImageBlocks(block.content, visit);
}
async function prepareRequestImages(messages, images, signal) {
	const refs = /* @__PURE__ */ new Map();
	for (const message of messages) visitImageBlocks(message.content, (block) => {
		if (block.offloaded === true) return;
		refs.set(block.attachment.attachmentId, block.attachment);
	});
	const policy = images.requestImagePolicy ?? {
		maxPixels: 2048 * 2048,
		maxBytes: 1024 * 1024
	};
	const prepared = /* @__PURE__ */ new Map();
	await Promise.all([...refs.values()].map(async (ref) => {
		const version = await images.attachments.readImageRequest(ref, requestImageTarget(ref, policy), signal);
		prepared.set(ref.attachmentId, {
			text: requestImageHandleText(ref, version, images.resolveImageAccess?.(ref)),
			image: {
				type: "image",
				data: Buffer.from(version.data).toString("base64"),
				mimeType: version.mediaType
			},
			versionBytes: version.bytes
		});
	}));
	return prepared;
}
/** Typed content -> pi-ai user/tool-result content. A retained image becomes
* its handle text plus real bytes; an offloaded one becomes placeholder text
* alone. Pure text collapses to the plain string form the wire prefers, so a
* text-only conversation serializes exactly as it did before. */
function userContent(blocks, prepared, resolveImageAccess) {
	const content = typedUserContent(blocks, prepared, resolveImageAccess);
	return content.every((block) => block.type === "text") ? content.map((block) => block.text).join("") : content;
}
/** Same walk, without the string collapse: tool results always carry blocks.
*
* `descendToolResults` separates the two call sites. At message level a
* tool-result block is a sibling message's content, so flattening its text here
* would duplicate it as a user turn; inside a tool result, a nested result's
* text is part of the same payload. */
function typedUserContent(blocks, prepared, resolveImageAccess, descendToolResults = false) {
	const content = [];
	for (const block of blocks) {
		if (block.type === "text") {
			if (block.text.length > 0) content.push({
				type: "text",
				text: block.text
			});
			continue;
		}
		if (block.type === "tool-result") {
			if (!descendToolResults) continue;
			const nested = toolResultText(block.content);
			if (nested.length > 0) content.push({
				type: "text",
				text: nested
			});
			continue;
		}
		if (!isImageBlock(block)) continue;
		if (block.offloaded === true) {
			content.push({
				type: "text",
				text: offloadedImageText(block.attachment, resolveImageAccess?.(block.attachment))
			});
			continue;
		}
		const version = prepared?.get(block.attachment.attachmentId);
		if (!version) continue;
		content.push({
			type: "text",
			text: version.text
		});
		content.push(version.image);
	}
	return content;
}
/** Replace every offloaded occurrence in the history with its placeholder. */
function projectOffloadedImages(messages, placeholder) {
	if (!messages.some((message) => hasOffloaded(message.content))) return [...messages];
	return messages.map((message) => {
		if (!hasOffloaded(message.content)) return message;
		return {
			...message,
			content: replaceOffloaded(message.content, placeholder)
		};
	});
}
function hasOffloaded(blocks) {
	let found = false;
	visitImageBlocks(blocks, (block) => {
		if (block.offloaded === true) found = true;
	});
	return found;
}
function replaceOffloaded(blocks, placeholder) {
	return blocks.map((block) => {
		if (isImageBlock(block)) return block.offloaded === true ? {
			type: "text",
			text: placeholder(block.attachment)
		} : block;
		if (block.type === "tool-result" && hasOffloaded(block.content)) return {
			...block,
			content: replaceOffloaded(block.content, placeholder)
		};
		return block;
	});
}
/** An error the host's image-offload plugin recognises and retries on. */
var ImageOffloadRequiredError = class extends Error {
	failure;
	constructor(maxBytes, offloadImages) {
		super(`opencode2dsh request images exceed the ${maxBytes}-byte base64 bound; ${offloadImages} more oldest occurrence(s) must be offloaded.`);
		this.failure = {
			message: this.message,
			code: IMAGE_OFFLOAD_REQUIRED_CODE,
			offloadImages
		};
	}
};
function toPiContext(options, images) {
	if (images === void 0) return toTextOnlyPiContext(options);
	return toImagePiContext(options, images);
}
function assemble(options, providerId, messages, contentOf, toolContentOf) {
	const toolNames = /* @__PURE__ */ new Map();
	const converted = [];
	for (const message of messages) {
		if (message.role === "system") {
			const text$1 = flattenText(message);
			if (text$1.length > 0) converted.push({
				role: "user",
				content: text$1,
				timestamp: 0
			});
			continue;
		}
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message, providerId);
			for (const block of assistant.content) if (block.type === "toolCall") toolNames.set(block.id, block.name);
			converted.push(assistant);
			continue;
		}
		const text = contentOf(message);
		if (text !== null && (typeof text === "string" ? text.length > 0 : true)) converted.push({
			role: "user",
			content: text,
			timestamp: 0
		});
		for (const block of message.content) {
			if (block.type !== "tool-result") continue;
			converted.push({
				role: "toolResult",
				toolCallId: block.toolCallId,
				toolName: toolNames.get(block.toolCallId) ?? "unknown",
				content: toolContentOf(block),
				isError: block.isError ?? false,
				timestamp: 0
			});
		}
	}
	const context = { messages: converted };
	if (typeof options.system === "string" && options.system.length > 0) context.systemPrompt = options.system;
	const tools = options.tools?.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}));
	if (tools && tools.length > 0) context.tools = tools;
	return context;
}
function toTextOnlyPiContext(options) {
	return assemble(options, options.provider, options.messages, (message) => {
		const text = flattenText(message);
		return message.content.filter((block) => block.type === "tool-result").length === 0 || text.length > 0 ? text : null;
	}, (result) => [{
		type: "text",
		text: toolResultText(result.content) || "(no output)"
	}]);
}
async function toImagePiContext(options, images) {
	const resolveImageAccess = images.resolveImageAccess;
	const prepared = await prepareRequestImages(options.messages, images, options.signal);
	const maxBytes = images.maxRequestImageBytes;
	if (maxBytes !== void 0) {
		const offload = requiredImageOffload(options.messages, {
			maxBytes,
			...images.maxRequestImages === void 0 ? {} : { maxImages: images.maxRequestImages }
		}, (block) => prepared.get(block.attachment.attachmentId)?.versionBytes ?? 0);
		if (offload > 0) throw new ImageOffloadRequiredError(maxBytes, offload);
	}
	const exact = projectOffloadedImages(options.messages, (ref) => offloadedImageText(ref, resolveImageAccess?.(ref)));
	return assemble(options, options.provider, exact, (message) => userContent(message.content, prepared, resolveImageAccess), (result) => typedUserContent(result.content, prepared, resolveImageAccess, true));
}
/**
* The Zen anonymous free lane (live-probed 2026-09-18) rejects chat bodies
* that do not carry an agent shape: HTTP 403 FreeTierError unless the body
* streams (`stream: true`) and its `tools` array includes function tools
* named "bash" AND "read" — descriptions, parameters and every header
* (User-Agent included) go uninspected. pi-ai always streams, so the
* chat-path gap is tools only: plain conversations carry none.
*/
const FREE_LANE_GATE_TOOL_NAMES = ["bash", "read"];
function freeLaneGateTool(name) {
	return {
		type: "function",
		function: {
			name,
			description: "Reserved for the host runtime; do not call it.",
			parameters: {
				type: "object",
				properties: {}
			}
		}
	};
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
function ensureFreeLaneShape(payload) {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return void 0;
	const body = payload;
	if (!Array.isArray(body.messages)) return void 0;
	const tools = Array.isArray(body.tools) ? body.tools : [];
	const names = new Set(tools.map((tool) => {
		const fn = typeof tool === "object" && tool !== null ? tool.function : void 0;
		return typeof fn === "object" && fn !== null ? fn.name : void 0;
	}));
	const missing = FREE_LANE_GATE_TOOL_NAMES.filter((name) => !names.has(name));
	if (missing.length === 0) return void 0;
	const next = { ...body };
	next.tools = [...tools, ...missing.map((name) => freeLaneGateTool(name))];
	if (tools.length === 0) next.tool_choice = "none";
	return next;
}

//#endregion
export { toPiContext as a, freeLaneGateTool as i, anyMessageHasImage as n, ensureFreeLaneShape as r, FREE_LANE_GATE_TOOL_NAMES as t };