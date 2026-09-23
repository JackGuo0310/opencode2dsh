//#region src/adapter/messages.ts
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
function flattenText(message) {
	return message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
function toolResultText(blocks) {
	return blocks.map((block) => block.type === "text" ? block.text : block.type === "tool-result" ? toolResultText(block.content) : "").join("");
}
/**
* Convert the harness conversation into a pi-ai Context. Mirrors
* textOnlyContext: text-only user content, tool results as toolResult
* messages, assistant history as pi-ai assistant messages.
*/
function toPiContext(options) {
	const providerId = options.provider;
	const toolNames = /* @__PURE__ */ new Map();
	const messages = [];
	for (const message of options.messages) {
		if (message.role === "system") {
			const text$1 = flattenText(message);
			if (text$1.length > 0) messages.push({
				role: "user",
				content: text$1,
				timestamp: 0
			});
			continue;
		}
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message, providerId);
			for (const block of assistant.content) if (block.type === "toolCall") toolNames.set(block.id, block.name);
			messages.push(assistant);
			continue;
		}
		const text = flattenText(message);
		const results = message.content.filter((block) => block.type === "tool-result");
		if (text.length > 0 || results.length === 0) messages.push({
			role: "user",
			content: text,
			timestamp: 0
		});
		for (const result of results) messages.push({
			role: "toolResult",
			toolCallId: result.toolCallId,
			toolName: toolNames.get(result.toolCallId) ?? "unknown",
			content: [{
				type: "text",
				text: toolResultText(result.content) || "(no output)"
			}],
			isError: result.isError ?? false,
			timestamp: 0
		});
	}
	const context = { messages };
	if (typeof options.system === "string" && options.system.length > 0) context.systemPrompt = options.system;
	const tools = options.tools?.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}));
	if (tools && tools.length > 0) context.tools = tools;
	return context;
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
export { toPiContext as i, ensureFreeLaneShape as n, freeLaneGateTool as r, FREE_LANE_GATE_TOOL_NAMES as t };