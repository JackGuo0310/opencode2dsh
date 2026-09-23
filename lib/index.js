import { a as defaultCachePath, d as disguiseHeaders, n as ZEN_BASE_URL, t as ModelCatalog, u as deriveRequestIDs } from "./catalog-zuYm4L_9.js";
import { i as toPiContext, n as ensureFreeLaneShape } from "./messages-PSa7_wRp.js";
import { n as routingContext } from "./dispatcher-C9pQXvDo.js";
import { a as shouldRotate, r as isRegionBlocked, t as classifyStreamFailure } from "./rotate-o6Ljmrzr.js";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createProvider } from "@earendil-works/pi-ai";
import * as openaiCompletions from "@earendil-works/pi-ai/api/openai-completions";
import * as openaiResponses from "@earendil-works/pi-ai/api/openai-responses";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import { platform } from "node:process";
import Schema from "@deepseek-ai/schemastery";
import { fileURLToPath } from "node:url";

//#region src/adapter/events.ts
const CONTEXT_WINDOW_EXCEEDED = "CONTEXT_WINDOW_EXCEEDED";
const EMPTY_RESPONSE = "EMPTY_RESPONSE";
const QUOTA_EXCEEDED = "QUOTA_EXCEEDED";
function classifyError(text) {
	if (/\b(?:401|403)\b/.test(text)) return "AUTH";
	if (/insufficient|quota|billing/i.test(text)) return QUOTA_EXCEEDED;
	if (/\b429\b|rate.?limit/i.test(text)) return "RATE_LIMIT";
	if (/\b413\b|payload too large|request body too large/i.test(text)) return "INVALID_REQUEST";
	if (/\b400\b|invalid.?request/i.test(text)) return "INVALID_REQUEST";
	if (/\b5\d\d\b/.test(text)) return "SERVER";
	if (/\btime(?:d)?\s*out\b|timeout/i.test(text)) return "TIMEOUT";
	if (/\b(?:network|connection|socket|fetch)\b|\bECONN[A-Z]+\b|terminated|premature close/i.test(text)) return "TRANSPORT";
	return "UPSTREAM";
}
function isContextOverflow(message, contextWindow) {
	return message.stopReason === "stop" && message.usage.input > contextWindow;
}
/** mapStopReason (dsh-llm-pi-ai index.js:1286-1330). */
function mapStopReason(message, contextWindow) {
	if (isContextOverflow(message, contextWindow) || message.stopReason === "error" && message.errorMessage !== void 0 && /context/i.test(message.errorMessage) && /exceed|window|length|token/i.test(message.errorMessage)) return {
		kind: "error",
		failure: {
			message: message.errorMessage ?? `pi-ai detected context overflow for model "${message.model}"`,
			code: CONTEXT_WINDOW_EXCEEDED
		}
	};
	switch (message.stopReason) {
		case "stop":
			if (message.content.length === 0) return {
				kind: "error",
				failure: {
					message: `model "${message.model}" returned a completed response with no content`,
					code: EMPTY_RESPONSE
				}
			};
			return { kind: "stop" };
		case "length": return { kind: "max-tokens" };
		case "toolUse": return { kind: "tool-calls" };
		case "aborted": return {
			kind: "aborted",
			failure: {
				message: message.errorMessage ?? "pi-ai stream aborted",
				code: "ABORTED"
			}
		};
		case "error": return {
			kind: "error",
			failure: {
				message: message.errorMessage ?? "pi-ai stream error",
				code: classifyError(message.errorMessage ?? "")
			}
		};
	}
}
function mapUsage(usage) {
	return {
		inputTokens: usage.input,
		outputTokens: usage.output,
		...usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {},
		...usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {}
	};
}
/**
* Translate one pi-ai event stream into harness chunks. pi-ai never throws
* mid-stream: failures arrive as `error` events and become error/aborted
* finish chunks.
*/
async function* toStreamChunks(events, contextWindow) {
	const toolIds = /* @__PURE__ */ new Map();
	for await (const event of events) switch (event.type) {
		case "start": break;
		case "text_start":
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "text"
			};
			break;
		case "text_delta":
			yield {
				type: "text-delta",
				index: event.contentIndex,
				text: event.delta
			};
			break;
		case "text_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "text",
					text: event.content
				}
			};
			break;
		case "thinking_start":
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "reasoning"
			};
			break;
		case "thinking_delta":
			yield {
				type: "reasoning-delta",
				index: event.contentIndex,
				text: event.delta
			};
			break;
		case "thinking_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "reasoning",
					text: event.content
				}
			};
			break;
		case "toolcall_start": {
			const partial = event.partial.content[event.contentIndex];
			const id = partial?.type === "toolCall" ? partial.id ?? "" : "";
			const name$1 = partial?.type === "toolCall" ? partial.name ?? "" : "";
			toolIds.set(event.contentIndex, {
				id,
				name: name$1
			});
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "tool-call"
			};
			break;
		}
		case "toolcall_delta": {
			const known = toolIds.get(event.contentIndex);
			yield {
				type: "tool-call-delta",
				index: event.contentIndex,
				id: known?.id ?? "",
				...known?.name !== void 0 && known.name.length > 0 ? { name: known.name } : {},
				argumentsDelta: event.delta
			};
			break;
		}
		case "toolcall_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "tool-call",
					id: event.toolCall.id,
					name: event.toolCall.name,
					arguments: JSON.stringify(event.toolCall.arguments)
				}
			};
			break;
		case "done":
			yield {
				type: "usage",
				usage: mapUsage(event.message.usage)
			};
			yield {
				type: "finish",
				reason: mapStopReason(event.message, contextWindow)
			};
			return;
		case "error":
			yield {
				type: "usage",
				usage: mapUsage(event.error.usage)
			};
			yield {
				type: "finish",
				reason: mapStopReason(event.error, contextWindow)
			};
			return;
	}
	throw new Error("opencode2dsh: pi-ai event stream ended without done/error");
}

//#endregion
//#region src/adapter/zen-adapter.ts
/**
* The TS adapter: registers as a DSH LlmAdapter for the `opencode2dsh` route
* and streams directly from the OpenCode Zen anonymous lane. The wire layer is
* pi-ai's openai-completions implementation for most models (the same one DSH
* uses for every OpenAI-compatible provider), plus pi-ai's openai-responses
* for Responses-only models (muse-spark-*); this module adds the CLI disguise
* headers, the derived session/request ids, and the free-model catalog.
*
* Adapter contract: dsh-llm LlmAdapter (providerInfo/listModels/resolveModel/
* prepareCall/stream) — structural, no host import.
*/
const PROVIDER_ID = "opencode2dsh";
const DEFAULT_CONTEXT_WINDOW = 262144;
const DEFAULT_MAX_TOKENS = 32768;
/** The advertised context window: the models.dev declaration when the
* metadata speaks, the host default otherwise (pending/absent metadata or a
* model that declares no `limit.context`). */
function contextWindowFor(limits) {
	return limits?.contextWindow !== void 0 && limits.contextWindow > 0 ? limits.contextWindow : DEFAULT_CONTEXT_WINDOW;
}
/**
* The default output cap: only ever LOWERED by a declared `limit.output`
* (never raised) — asking upstream for more tokens than the model allows is
* a hard 400, while the conservative host default stays untouched whenever
* the model allows at least that much (or the metadata cannot speak).
*/
function defaultMaxTokensFor(limits) {
	return limits?.maxOutput !== void 0 && limits.maxOutput > 0 ? Math.min(DEFAULT_MAX_TOKENS, limits.maxOutput) : DEFAULT_MAX_TOKENS;
}
/**
* Reasoning-effort vocabulary the adapter owns end to end (dsh-llm treats the
* ids as opaque: whatever resolveModel advertises comes back on
* GenerateOptions.reasoningEffort). The ladder mirrors pi-ai's ThinkingLevel
* so selected levels pass through untouched; `off` is the only id that maps
* to a different wire spelling.
*/
const REASONING_EFFORT_LADDER = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
/** Levels offered for reasoning models whose metadata declares no ladder. */
const DEFAULT_EFFORT_LADDER = [
	"off",
	"minimal",
	"low",
	"medium",
	"high"
];
/**
* Turn the catalog's models.dev capability into the advertised effort list.
* A declared ladder (models.dev `reasoning_options` effort values) wins — its
* values are the upstream-honored spellings, with metadata `none` folded into
* our `off`. Without a declaration, a reasoning model gets the standard
* ladder the Zen gateway accepts for every model. Non-reasoning models
* advertise nothing (the picker then offers only the provider default).
*/
function reasoningEfforts(capability) {
	if (!capability?.reasoning) return void 0;
	const declared = [];
	for (const value of capability.effortValues) {
		const level = value === "none" ? "off" : value;
		if (REASONING_EFFORT_LADDER.includes(level) && !declared.includes(level)) declared.push(level);
	}
	return (declared.length > 0 ? declared.sort((a, b) => REASONING_EFFORT_LADDER.indexOf(a) - REASONING_EFFORT_LADDER.indexOf(b)) : DEFAULT_EFFORT_LADDER).map((level) => ({
		id: level,
		name: `${level.charAt(0).toUpperCase()}${level.slice(1)}`
	}));
}
/**
* The `reasoning_effort` wire value for a selected effort id. The Zen gateway
* validates the field against `minimal|low|medium|high|xhigh|max|none`
* (live-probed 2026-09-18: any other value is a hard 400), and `none` is the
* only spelling that stops the always-think free models from thinking — a
* mere omission keeps the provider default. So `off` maps to wire `none`,
* ladder levels pass through verbatim, and unknown ids (never advertised)
* inject nothing rather than risk the 400.
*/
function reasoningEffortWire(id) {
	if (id === void 0) return void 0;
	if (id === "off") return "none";
	return REASONING_EFFORT_LADDER.includes(id) ? id : void 0;
}
/** Anonymous credential: the literal upstream accepts for the free lane. */
const ANONYMOUS_KEY = "public";
/**
* Stream-liveness watchdogs (live-observed 2026-09-07): neither fetch nor
* pi-ai owns a body-silence timeout, so a tunnel that stands but never
* streams hangs the turn forever (70 minutes observed). Both messages
* carry "timeout" so classifyStreamFailure maps them to 'transport' and
* the rotate loop gets to move the session to a live exit.
*/
const WATCHDOG_FIRST_MESSAGE = "opencode2dsh: first stream event timeout (exit silent before any response)";
const WATCHDOG_IDLE_MESSAGE = "opencode2dsh: stream body idle timeout (exit went silent mid-response)";
/** Default watchdog windows (docs/ip-pool.md; test-injectable via constructor). */
const DEFAULT_FIRST_EVENT_MS = 3e4;
const DEFAULT_BODY_IDLE_MS = 12e4;
/**
* Body-idle window for Responses models (muse-spark-*, issue #7): their
* chain-of-thought streams pace in bursts with long mid-stream pauses, so
* the chat default misreads slow reasoning as a dead tunnel. Named and
* constructor-injectable so tests can exercise the wider window without
* waiting out five real minutes.
*/
const RESPONSES_BODY_IDLE_MS = 3e5;
/** The terminal error event pi-ai owes but never sent (watchdog teardown). */
function terminalErrorEvent(errorMessage, model) {
	return {
		type: "error",
		error: {
			api: model.api ?? "openai-completions",
			provider: PROVIDER_ID,
			model: model.id,
			content: [],
			stopReason: "error",
			errorMessage,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0
			}
		}
	};
}
/**
* Responses-only models on Zen (issue #7): `muse-spark-*` return a bare 500
* on `POST /zen/v1/chat/completions` but 200 on `POST /zen/v1/responses`
* (opencode #44659/#44847, DSH #3957). Route by model id; extend this list
* if Zen moves more models (candidates: gpt-5.6-luna, grok-4.6).
*/
function isResponsesModel(id) {
	return String(id ?? "").toLowerCase().startsWith("muse-spark");
}
function toPiModel(id, reasoning, limits) {
	return {
		id,
		name: id,
		api: isResponsesModel(id) ? "openai-responses" : "openai-completions",
		provider: PROVIDER_ID,
		baseUrl: `${ZEN_BASE_URL.replace(/\/+$/, "")}/v1`,
		reasoning,
		input: ["text"],
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0
		},
		contextWindow: contextWindowFor(limits),
		maxTokens: defaultMaxTokensFor(limits)
	};
}
var ZenAdapter = class {
	#catalog;
	#provider;
	#responsesProvider;
	#firstEventMs;
	#bodyIdleMs;
	#responsesBodyIdleMs;
	constructor(catalog, options = {}) {
		this.#catalog = catalog;
		this.#firstEventMs = options.firstEventMs ?? DEFAULT_FIRST_EVENT_MS;
		this.#bodyIdleMs = options.bodyIdleMs ?? DEFAULT_BODY_IDLE_MS;
		this.#responsesBodyIdleMs = options.responsesBodyIdleMs ?? RESPONSES_BODY_IDLE_MS;
		if (options.providerOverride !== void 0) {
			this.#provider = options.providerOverride;
			this.#responsesProvider = null;
			return;
		}
		const baseUrl = `${(options.zenBaseUrl ?? ZEN_BASE_URL).replace(/\/+$/, "")}/v1`;
		const auth = { apiKey: {
			name: "OpenCode Zen anonymous lane",
			resolve: async () => ({ auth: { apiKey: ANONYMOUS_KEY } })
		} };
		this.#provider = createProvider({
			id: PROVIDER_ID,
			name: PROVIDER_ID,
			baseUrl,
			auth,
			models: [],
			api: openaiCompletions
		});
		this.#responsesProvider = createProvider({
			id: PROVIDER_ID,
			name: PROVIDER_ID,
			baseUrl,
			auth,
			models: [],
			api: openaiResponses
		});
	}
	providerInfo(provider) {
		return {
			id: provider,
			name: PROVIDER_ID
		};
	}
	/**
	* dsh-llm calls this unconditionally at registration (index.js:1208).
	* undefined = the host default retry policy, matching sidecar behavior.
	*/
	providerRetryPolicy(_provider) {}
	/** Advisory catalog for the DSH model picker (deduped; dsh-llm rejects duplicates). */
	listModels(provider) {
		const seen = /* @__PURE__ */ new Set();
		const models = [];
		for (const id of this.#catalog.list()) {
			if (seen.has(id)) continue;
			seen.add(id);
			models.push({
				provider,
				id,
				name: id,
				inputModalities: ["text"]
			});
		}
		return models;
	}
	resolveModel(provider, model) {
		const resolved = {
			provider,
			id: model,
			name: model,
			inputModalities: ["text"],
			context: { contextWindow: contextWindowFor(this.#catalog.limits?.(model)) },
			defaultMaxTokens: defaultMaxTokensFor(this.#catalog.limits?.(model))
		};
		const efforts = reasoningEfforts(this.#catalog.reasoningCapability(model));
		if (efforts) resolved.reasoning = { efforts };
		return resolved;
	}
	async prepareCall(provider, model, _signal) {
		return {
			model: this.resolveModel(provider, model),
			stream: (options) => this.stream(options)
		};
	}
	/** Stream one Chat turn from the Zen anonymous lane.
	*
	* IP-7 rotate loop (docs/ip-pool.md §3.4 / §8.1): a stream that dies
	* BEFORE any content landed restarts on a fresh exit — the pool's health
	* marks already degraded the failed exit, so the restarted pick routes
	* elsewhere, and the host's retry budget never sees the intermediate
	* error. Once ANY content event has flowed, rotation stops (§3.4: a
	* partially delivered stream is never replayed). No pool running (or the
	* failure is not exit-shaped) = the original stream surface untouched.
	*/
	async *stream(options) {
		const context = toPiContext(options);
		const ids = deriveRequestIDs(options.messages);
		const model = toPiModel(options.model, this.#catalog.reasoningCapability(options.model)?.reasoning === true, this.#catalog.limits?.(options.model));
		const contextStore = {
			model: options.model,
			session: ids.session
		};
		const self = this;
		const MAX_ROTATES = 3;
		const firstEventMs = this.#firstEventMs;
		const bodyIdleMs = model.api === "openai-responses" ? Math.max(this.#bodyIdleMs, this.#responsesBodyIdleMs) : this.#bodyIdleMs;
		const rotateStory = [];
		for (let attempt = 0;; attempt += 1) {
			const events = routingContext.run(contextStore, () => self.#eventsFor(options, context, ids, model));
			let deliveredContent = false;
			let preContentFailure = null;
			const buffered = [];
			const source = events[Symbol.asyncIterator]();
			let sawAnyEvent = false;
			let lastEventAt = Date.now();
			let deadlineTimer;
			const raceDeadline = () => {
				clearTimeout(deadlineTimer);
				const idleWindow = sawAnyEvent ? bodyIdleMs : firstEventMs;
				const message = sawAnyEvent ? WATCHDOG_IDLE_MESSAGE : WATCHDOG_FIRST_MESSAGE;
				const ms = Math.max(0, idleWindow - (Date.now() - lastEventAt));
				return new Promise((_, reject) => {
					deadlineTimer = setTimeout(() => reject(new Error(message)), ms);
					deadlineTimer.unref?.();
				});
			};
			const pumpLive = async function* () {
				for (const e of buffered) yield e;
				for (;;) {
					let next;
					try {
						next = await Promise.race([source.next(), raceDeadline()]);
					} catch (err) {
						yield terminalErrorEvent(err instanceof Error ? err.message : String(err), model);
						return;
					}
					if (next.done) {
						clearTimeout(deadlineTimer);
						return;
					}
					const event = next.value;
					lastEventAt = Date.now();
					if (event.type === "error" || event.type === "done") {
						clearTimeout(deadlineTimer);
						yield event;
						return;
					}
					yield event;
				}
			};
			for (;;) {
				let next;
				try {
					next = await Promise.race([source.next(), raceDeadline()]);
				} catch (err) {
					preContentFailure = { message: err instanceof Error ? err.message : String(err) };
					buffered.push(terminalErrorEvent(preContentFailure.message, model));
					break;
				}
				if (next.done) break;
				const event = next.value;
				lastEventAt = Date.now();
				sawAnyEvent = true;
				if (event.type === "error") {
					preContentFailure = { message: event.error.errorMessage ?? "pi-ai stream error" };
					buffered.push(event);
					break;
				}
				if (event.type === "done") {
					if (event.message.stopReason === "error" && !deliveredContent) preContentFailure = { message: event.message.errorMessage ?? "pi-ai stream error" };
					buffered.push(event);
					break;
				}
				buffered.push(event);
				if (event.type !== "start") deliveredContent = true;
				if (deliveredContent) break;
			}
			clearTimeout(deadlineTimer);
			if (preContentFailure === null && deliveredContent) {
				yield* toStreamChunks(pumpLive(), model.contextWindow);
				return;
			}
			if (preContentFailure === null && !deliveredContent) {
				yield* toStreamChunks((async function* pumped() {
					for (const e of buffered) yield e;
				})(), model.contextWindow);
				return;
			}
			const failureMessage = preContentFailure.message;
			const failure = classifyStreamFailure(failureMessage);
			const deterministic = isRegionBlocked(failureMessage);
			const rotate = failure !== null && attempt < MAX_ROTATES && shouldRotate(failure, options.model, ids.session, attempt + 1, deterministic);
			rotateStory.push(`#${attempt + 1} ${failure ?? "unknown"}: ${failureMessage.slice(0, 80)}`);
			if (!rotate) {
				for (let i = 0; i < buffered.length; i += 1) {
					const e = buffered[i];
					if (e.type === "error" && e.error) {
						e.error.errorMessage = rotateStory.length > 1 ? `${e.error.errorMessage} (opencode2dsh 轮换 ${rotateStory.length - 1} 次后放弃: ${rotateStory.join(" -> ")})` : e.error.errorMessage;
						break;
					}
					if (e.type === "done" && e.message?.stopReason === "error") {
						e.message.errorMessage = rotateStory.length > 1 ? `${e.message.errorMessage} (opencode2dsh 轮换 ${rotateStory.length - 1} 次后放弃: ${rotateStory.join(" -> ")})` : e.message.errorMessage;
						break;
					}
				}
				yield* toStreamChunks((async function* pumped() {
					for (const e of buffered) yield e;
				})(), model.contextWindow);
				return;
			}
		}
	}
	#eventsFor(options, context, ids, model) {
		const effortWire = reasoningEffortWire(options.reasoningEffort);
		const onPayload = effortWire === void 0 ? ensureFreeLaneShape : (payload) => {
			const shaped = ensureFreeLaneShape(payload);
			if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return shaped;
			return {
				...shaped ?? payload,
				reasoning_effort: effortWire
			};
		};
		return (isResponsesModel(model.id) && this.#responsesProvider ? this.#responsesProvider : this.#provider).streamSimple(model, context, {
			apiKey: ANONYMOUS_KEY,
			sessionId: ids.session,
			headers: disguiseHeaders(ids),
			onPayload,
			signal: options.signal,
			maxRetries: 0,
			temperature: options.temperature,
			maxTokens: options.maxTokens
		});
	}
	/** Expose the live catalog snapshot for diagnostics. */
	catalogStatus() {
		const list = this.#catalog.list();
		return {
			total: list.length,
			exposed: list.length
		};
	}
	decisionFor(model) {
		const decision = this.#catalog.decision(model);
		return {
			allowed: decision.allowed,
			source: decision.source
		};
	}
};

//#endregion
//#region src/agent-process.ts
const GRACEFUL_STOP_TIMEOUT_MS = 5e3;
/**
* Uptime after which a run counts as "stable": the consecutive-crash counter
* resets. Prevents an infinite fast-crash loop from never tripping the breaker
* just because each spawn briefly reaches READY.
*/
const STABLE_UPTIME_MS = 3e4;
var AgentProcess = class extends EventEmitter {
	child = null;
	state = "stopped";
	consecutiveCrashes = 0;
	restartTimer = null;
	stopping = false;
	disposed = false;
	backoffMs;
	readySinceMs = 0;
	#ready = null;
	agentPath;
	args;
	options;
	constructor(agentPath, args, options) {
		super();
		this.agentPath = agentPath;
		this.args = args;
		this.options = options;
		this.backoffMs = options.restartDelayMs;
	}
	getState() {
		return this.state;
	}
	get readyInfo() {
		return this.#ready;
	}
	/** Spawn the agent and resolve with the READY handshake result. */
	async start(readyTimeoutMs = 1e4) {
		if (this.state === "ready" && this.#ready) return this.#ready;
		if (this.state === "starting") throw new Error("agent start already in progress");
		if (this.state === "tripped") throw new Error("agent circuit breaker tripped; restart the plugin");
		this.stopping = false;
		this.setState("starting");
		const child = spawn(this.agentPath, this.args, { stdio: [
			"ignore",
			"pipe",
			"pipe"
		] });
		this.child = child;
		this.pipeLogs(child);
		const spawnError = new Promise((_, reject) => {
			child.once("error", reject);
		});
		const stdoutReady = this.readReadyLine(child);
		const earlyExit = new Promise((_, reject) => {
			child.once("exit", (code) => reject(/* @__PURE__ */ new Error(`agent exited before READY (code ${code})`)));
		});
		try {
			this.#ready = await Promise.race([
				stdoutReady,
				spawnError,
				earlyExit,
				new Promise((_, reject) => setTimeout(() => reject(/* @__PURE__ */ new Error(`agent READY handshake timed out after ${readyTimeoutMs}ms`)), readyTimeoutMs))
			]);
		} catch (err) {
			this.detach(child);
			await this.killTree(child).catch(() => {});
			this.setState("stopped");
			throw err;
		}
		this.setState("ready");
		this.readySinceMs = Date.now();
		child.once("exit", (code) => this.onExit(child, code));
		return this.#ready;
	}
	/** Read stdout until the READY line (design.md section 8.2). */
	readReadyLine(child) {
		return new Promise((resolve, reject) => {
			const stdout = child.stdout;
			if (!stdout) return reject(/* @__PURE__ */ new Error("agent stdout is not piped"));
			const rl = createInterface({ input: stdout });
			let settled = false;
			const settle = (fn) => {
				if (settled) return;
				settled = true;
				fn();
				rl.close();
			};
			rl.on("line", (line) => {
				this.options.onLog?.(line);
				const match = /^READY (\{.*\})\s*$/.exec(line);
				if (!match?.[1]) return;
				try {
					const info = JSON.parse(match[1]);
					if (!Number.isInteger(info.port) || info.port <= 0) throw new Error(`invalid READY payload: ${line}`);
					settle(() => resolve(info));
				} catch (err) {
					settle(() => reject(err instanceof Error ? err : new Error(String(err))));
				}
			});
			rl.on("close", () => {
				if (settled) return;
				settled = true;
				reject(/* @__PURE__ */ new Error("agent stdout closed before READY"));
			});
		});
	}
	pipeLogs(child) {
		child.stderr?.on("data", (chunk) => {
			for (const line of chunk.toString("utf8").split("\n")) if (line.length > 0) this.options.onLog?.(line);
		});
	}
	onExit(child, code) {
		if (child !== this.child || this.disposed) return;
		this.#ready = null;
		if (this.stopping) {
			this.setState("stopped");
			return;
		}
		if (this.readySinceMs !== 0 && Date.now() - this.readySinceMs >= STABLE_UPTIME_MS) {
			this.consecutiveCrashes = 0;
			this.backoffMs = this.options.restartDelayMs;
		}
		this.readySinceMs = 0;
		this.consecutiveCrashes += 1;
		if (this.consecutiveCrashes >= this.options.maxConsecutiveCrashes) {
			this.setState("tripped");
			this.emit("circuit-tripped", this.consecutiveCrashes);
			return;
		}
		const delay = this.backoffMs;
		this.backoffMs = Math.min(this.backoffMs * 2, this.options.restartMaxDelayMs);
		this.emit("exit-restart", delay, this.consecutiveCrashes);
		this.restartTimer = setTimeout(() => {
			this.restartTimer = null;
			this.start().catch(() => {});
		}, delay);
	}
	detach(child) {
		child.removeAllListeners("exit");
		child.stderr?.removeAllListeners("data");
		if (this.child === child) this.child = null;
	}
	/** Graceful stop: terminate, wait, then force-kill the whole tree. */
	async stop() {
		this.stopping = true;
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = null;
		}
		const child = this.child;
		if (!child || child.exitCode !== null) {
			this.setState("stopped");
			return;
		}
		await this.terminate(child);
		this.setState("stopped");
	}
	/** Idempotent teardown: no more restarts after dispose. */
	async dispose() {
		this.disposed = true;
		await this.stop();
	}
	async terminate(child) {
		if (process.platform === "win32") await this.taskkill(child, false).catch(() => {});
		else child.kill("SIGTERM");
		const exited = new Promise((resolve) => child.once("exit", () => resolve()));
		const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), GRACEFUL_STOP_TIMEOUT_MS));
		if (await Promise.race([exited.then(() => "exit"), timeout]) === "timeout") {
			if (process.platform === "win32") await this.taskkill(child, true).catch(() => child.kill());
			else child.kill("SIGKILL");
			await exited;
		}
	}
	async killTree(child) {
		if (child.exitCode !== null) return;
		if (process.platform === "win32") await this.taskkill(child, true).catch(() => child.kill());
		else child.kill("SIGKILL");
	}
	taskkill(child, force) {
		return new Promise((resolve, reject) => {
			if (!child.pid) return resolve();
			const killer = spawn("taskkill", force ? [
				"/T",
				"/F",
				"/PID",
				String(child.pid)
			] : [
				"/T",
				"/PID",
				String(child.pid)
			], { stdio: "ignore" });
			killer.once("error", reject);
			killer.once("exit", () => resolve());
		});
	}
	setState(state) {
		this.state = state;
		this.emit("state", state);
	}
};

//#endregion
//#region src/config.ts
const defaults = {
	providerId: "opencode2dsh",
	apiKeyEnv: "OPENCODE2DSH_TOKEN",
	refreshSeconds: 300,
	restartDelayMs: 1e3,
	restartMaxDelayMs: 6e4,
	maxConsecutiveCrashes: 5
};
function resolveConfig(config = {}) {
	return {
		...defaults,
		...config
	};
}
function configPaths(dataDir) {
	return {
		dataDir,
		configPath: join(dataDir, "agent-config.json"),
		tokenPath: join(dataDir, "agent-token.txt")
	};
}
/** 32-byte random token, base64url (design.md section 7). */
function generateToken() {
	return randomBytes(32).toString("base64url");
}
async function fileExists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
/**
* Read the persisted token or generate and persist a fresh one.
* Best-effort 0600 on POSIX; Windows profile dirs are user-scoped already.
*/
async function ensureToken(paths) {
	if (await fileExists(paths.tokenPath)) {
		const existing = (await readFile(paths.tokenPath, "utf8")).trim();
		if (existing.length > 0) return existing;
	}
	const token = generateToken();
	await mkdir(dirname(paths.tokenPath), { recursive: true });
	await writeFile(paths.tokenPath, token + "\n", { encoding: "utf8" });
	if (platform !== "win32") await chmod(paths.tokenPath, 384).catch(() => {});
	return token;
}
/**
* Write agent-config.json atomically (tmp + rename) every plugin start, so a
* version upgrade or option change reaches the next agent spawn. The agent
* accepts JSON with comments; we emit plain JSON.
*/
async function writeAgentConfig(paths, options) {
	const config = {
		listen: "127.0.0.1:0",
		server_keys: [options.token],
		anonymous: true,
		zen_keys: [],
		go_keys: [],
		upstream: { zen: "https://opencode.ai/zen" },
		models: { refresh_seconds: options.refreshSeconds },
		retry: {
			max_attempts: 2,
			timeout_seconds: 300
		},
		proxies: ["direct"],
		logging: { level: "info" }
	};
	await mkdir(paths.dataDir, { recursive: true });
	const tmpPath = paths.configPath + ".tmp";
	await writeFile(tmpPath, JSON.stringify(config, null, 2), "utf8");
	await rm(paths.configPath, { force: true });
	await rename(tmpPath, paths.configPath);
}

//#endregion
//#region node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.2/node_modules/@deepseek-ai/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Define a non-enumerable writable property and return the object. */
function defineProperty(object, key, value) {
	return Object.defineProperty(object, key, {
		writable: true,
		value,
		enumerable: false
	});
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value$1) => is(type, value$1);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary$1) {
	Binary$1.is = isArrayBufferLike;
	Binary$1.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary$1.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary$1.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary$1.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary$1.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary$1.fromHex = fromHex;
})(Binary || (Binary = {}));
/** Decode a base64 string into binary data. */
const base64ToArrayBuffer = Binary.fromBase64;
/** Encode binary data as base64. */
const arrayBufferToBase64 = Binary.toBase64;
/** Decode a hex string into binary data. */
const hexToArrayBuffer = Binary.fromHex;
/** Encode binary data as hex. */
const arrayBufferToHex = Binary.toHex;
function tokenize(source, delimiters, delimiter) {
	const output = [];
	let state = 0;
	for (let i = 0; i < source.length; i++) {
		const code = source.charCodeAt(i);
		if (code >= 65 && code <= 90) {
			if (state === 1) {
				const next = source.charCodeAt(i + 1);
				if (next >= 97 && next <= 122) output.push(delimiter);
				output.push(code + 32);
			} else {
				if (state !== 0) output.push(delimiter);
				output.push(code + 32);
			}
			state = 1;
		} else if (code >= 97 && code <= 122) {
			output.push(code);
			state = 2;
		} else if (delimiters.includes(code)) {
			if (state !== 0) output.push(delimiter);
			state = 0;
		} else output.push(code);
	}
	return String.fromCharCode(...output);
}
/** Convert text to dash-delimited parameter case. */
function paramCase(source) {
	return tokenize(source, [45, 95], 45);
}
/** Runtime alias for `paramCase`. */
const hyphenate = paramCase;
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time$1) {
	Time$1.millisecond = 1;
	Time$1.second = 1e3;
	Time$1.minute = Time$1.second * 60;
	Time$1.hour = Time$1.minute * 60;
	Time$1.day = Time$1.hour * 24;
	Time$1.week = Time$1.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time$1.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time$1.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time$1.minute - offset) / 1440);
	}
	Time$1.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time$1.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time$1.minute);
	}
	Time$1.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = /* @__PURE__ */ new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time$1.week || 0) + (parseFloat(capture[2]) * Time$1.day || 0) + (parseFloat(capture[3]) * Time$1.hour || 0) + (parseFloat(capture[4]) * Time$1.minute || 0) + (parseFloat(capture[5]) * Time$1.second || 0);
	}
	Time$1.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time$1.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time$1.day - Time$1.hour / 2) return Math.round(ms / Time$1.day) + "d";
		else if (abs >= Time$1.hour - Time$1.minute / 2) return Math.round(ms / Time$1.hour) + "h";
		else if (abs >= Time$1.minute - Time$1.second / 2) return Math.round(ms / Time$1.minute) + "m";
		else if (abs >= Time$1.second) return Math.round(ms / Time$1.second) + "s";
		return ms + "ms";
	}
	Time$1.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time$1.toDigits = toDigits;
	function template(template$1, time = /* @__PURE__ */ new Date()) {
		return template$1.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time$1.template = template;
})(Time || (Time = {}));

//#endregion
//#region node_modules/.pnpm/@deepseek-ai+cordis@4.0.1_@_478c74d8cf3bc4916164eff3e3b388d7/node_modules/@deepseek-ai/cordis/lib/index.js
/** Ordered collection of disposable values with O(1) deletion by value. */
var DisposableList = class {
	sn = 0;
	map = /* @__PURE__ */ new Map();
	weak = /* @__PURE__ */ new WeakMap();
	get length() {
		return this.map.size;
	}
	push(value) {
		const sn = ++this.sn;
		this.map.set(sn, value);
		this.weak.set(value, sn);
		return () => this.map.delete(sn);
	}
	delete(value) {
		const sn = this.weak.get(value);
		if (!sn) return false;
		return this.map.delete(sn);
	}
	clear() {
		const values = [...this.map.values()];
		this.map.clear();
		return values.reverse();
	}
	[Symbol.iterator]() {
		return this.map.values();
	}
	[Symbol.for("nodejs.util.inspect.custom")]() {
		return [...this];
	}
};
/** Shared symbols used to avoid public property-name collisions. */
const symbols = {
	shadow: Symbol.for("cordis.shadow"),
	receiver: Symbol.for("cordis.receiver"),
	original: Symbol.for("cordis.original"),
	metadata: Symbol.for("cordis.metadata"),
	initHooks: Symbol.for("cordis.initHooks"),
	checkProto: Symbol.for("cordis.checkProto"),
	effect: Symbol.for("cordis.effect"),
	filter: Symbol.for("cordis.filter"),
	isolate: Symbol.for("cordis.isolate"),
	intercept: Symbol.for("cordis.intercept"),
	init: Symbol.for("cordis.init"),
	check: Symbol.for("cordis.check"),
	config: Symbol.for("cordis.config"),
	invoke: Symbol.for("cordis.invoke"),
	extend: Symbol.for("cordis.extend"),
	tracker: Symbol.for("cordis.tracker"),
	resolveConfig: Symbol.for("cordis.resolveConfig")
};
const GeneratorFunction = function* () {}.constructor;
const AsyncGeneratorFunction = async function* () {}.constructor;
/** Return true when a plugin callback should be constructed with `new`. */
function isConstructor(func) {
	if (!func.prototype) return false;
	if (func instanceof GeneratorFunction) return false;
	if (AsyncGeneratorFunction !== Function && func instanceof AsyncGeneratorFunction) return false;
	return true;
}
/** Merge two prototype chains while preserving descriptors from `proto1`. */
function joinPrototype(proto1, proto2) {
	if (proto1 === Object.prototype) return proto2;
	const result = Object.create(joinPrototype(Object.getPrototypeOf(proto1), proto2));
	for (const key of Reflect.ownKeys(proto1)) Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(proto1, key));
	return result;
}
/** Return true for non-null objects and functions. */
function isObject(value) {
	return value && (typeof value === "object" || typeof value === "function");
}
/** Find a property descriptor by walking an object's prototype chain. */
function getPropertyDescriptor(target, prop) {
	let proto = target;
	while (proto) {
		const desc = Reflect.getOwnPropertyDescriptor(proto, prop);
		if (desc) return desc;
		proto = Object.getPrototypeOf(proto);
	}
}
/** Wrap services/functions so method calls see the caller's active context. */
function getTraceable(ctx, value) {
	if (!isObject(value)) return value;
	if (Object.hasOwn(value, symbols.shadow)) return Object.getPrototypeOf(value);
	const tracker = value[symbols.tracker];
	if (!tracker) return value;
	return createTraceable(ctx, value, tracker);
}
/** Return a proxy that overlays readonly or writable properties onto a target. */
function withProps(target, props) {
	if (!props) return target;
	return new Proxy(target, {
		get: (target$1, prop, receiver) => {
			if (prop in props && prop !== "constructor") return Reflect.get(props, prop, receiver);
			return Reflect.get(target$1, prop, receiver);
		},
		set: (target$1, prop, value, receiver) => {
			if (prop in props && prop !== "constructor") return Reflect.set(props, prop, value, receiver);
			return Reflect.set(target$1, prop, value, receiver);
		}
	});
}
function withProp(target, prop, value) {
	return withProps(target, Object.defineProperty(Object.create(null), prop, {
		value,
		writable: false
	}));
}
function createShadow(ctx, target, property, receiver) {
	if (!property) return receiver;
	const origin = Reflect.getOwnPropertyDescriptor(target, property)?.value;
	if (!origin) return receiver;
	return withProp(receiver, property, ctx.extend({ [symbols.shadow]: origin }));
}
function createShadowMethod(ctx, value, outer, shadow) {
	return new Proxy(value, { apply: (target, thisArg, args) => {
		if (thisArg === outer) thisArg = shadow;
		return getTraceable(ctx, Reflect.apply(target, thisArg, args));
	} });
}
function createTraceable(ctx, value, tracker) {
	if (ctx[symbols.shadow] && !tracker.noShadow) ctx = Object.getPrototypeOf(ctx);
	const proxy = new Proxy(value, {
		get: (target, prop, receiver) => {
			if (prop === symbols.original) return target;
			if (prop === tracker.property) return ctx;
			if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
			if (tracker.associate && ctx.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.get(ctx, `${tracker.associate}.${prop}`, withProp(ctx, symbols.receiver, receiver));
			let shadow, innerValue;
			const desc = getPropertyDescriptor(target, prop);
			if (desc && "value" in desc) innerValue = desc.value;
			else {
				shadow = createShadow(ctx, target, tracker.property, receiver);
				innerValue = Reflect.get(target, prop, shadow);
			}
			const innerTracker = innerValue?.[symbols.tracker];
			if (innerTracker) return createTraceable(ctx, innerValue, innerTracker);
			else if (!tracker.noShadow && typeof innerValue === "function") {
				shadow ??= createShadow(ctx, target, tracker.property, receiver);
				return createShadowMethod(ctx, innerValue, receiver, shadow);
			} else return innerValue;
		},
		set: (target, prop, value$1, receiver) => {
			if (prop === symbols.original) return false;
			if (prop === tracker.property) return false;
			if (typeof prop === "symbol") return Reflect.set(target, prop, value$1, receiver);
			if (tracker.associate && ctx.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.set(ctx, `${tracker.associate}.${prop}`, value$1, withProp(ctx, symbols.receiver, receiver));
			const shadow = createShadow(ctx, target, tracker.property, receiver);
			return Reflect.set(target, prop, value$1, shadow);
		},
		apply: (target, thisArg, args) => {
			return applyTraceable(proxy, target, thisArg, args);
		}
	});
	return proxy;
}
function applyTraceable(proxy, value, thisArg, args) {
	if (!value[symbols.invoke]) return Reflect.apply(value, thisArg, args);
	return value[symbols.invoke].apply(proxy, args);
}
/** Create a callable service object that dispatches through `symbols.invoke`. */
function createCallable(name$1, proto, tracker) {
	const self = function(...args) {
		return applyTraceable(createTraceable(self["ctx"], self, tracker), self, this, args);
	};
	defineProperty(self, "name", name$1);
	return Object.setPrototypeOf(self, proto);
}
function handleError(info, reason, getOuterStack) {
	const innerLines = info.error.stack.split("\n");
	if (typeof reason?.stack !== "string") {
		const outerError = new Error(reason);
		const lines$1 = outerError.stack.split("\n");
		lines$1.splice(1, Infinity, ...getOuterStack());
		outerError.stack = lines$1.join("\n");
		throw outerError;
	}
	const lines = reason.stack.split("\n");
	let index = lines.indexOf(innerLines[2]);
	if (index === -1) throw reason;
	index -= info.offset;
	while (index > 0) {
		if (!lines[index - 1].endsWith(" (<anonymous>)")) break;
		index -= 1;
	}
	lines.splice(index, Infinity, ...getOuterStack());
	reason.stack = lines.join("\n");
	throw reason;
}
/** Run a callback and splice outer call-site frames into thrown async errors. */
function composeError(callback, getOuterStack = buildOuterStack()) {
	const info = {
		offset: 1,
		error: /* @__PURE__ */ new Error()
	};
	try {
		const result = callback(info);
		if (isObject(result) && "then" in result) return result.then(void 0, (reason) => handleError(info, reason, getOuterStack));
		else return result;
	} catch (reason) {
		handleError(info, reason, getOuterStack);
	}
}
/** Capture a lazy stack-frame supplier for later error composition. */
function buildOuterStack(offset = 0) {
	const outerError = /* @__PURE__ */ new Error();
	return () => outerError.stack.split("\n").slice(3 + offset);
}
/**
* Return whether an event result should stop a bail-style dispatch.
*
* @param value — a listener's return value.
* @returns `true` unless `value` is `null`, `false`, or `undefined`.
*/
function isBailed(value) {
	return value !== null && value !== false && value !== void 0;
}
/**
* Event bus installed as `ctx.events` and mixed into every context.
*
* The service supports concurrent, synchronous, serial, bail, and waterfall
* dispatch and automatically disposes listeners with their owning fiber.
*/
var EventsService = class {
	ctx;
	_hooks = {};
	constructor(ctx) {
		this.ctx = ctx;
		defineProperty(this, symbols.tracker, {
			property: "ctx",
			noShadow: true
		});
		this.on("internal/listener", function(name$1, listener, options) {
			if (name$1 === "internal/update" && !options.global) return (this.fiber._hooks["internal/update"] ??= new DisposableList())[options.prepend ? "unshift" : "push"](listener);
		});
		this.on("internal/update", function(config, noSave, next) {
			const cbs = [...this._hooks["internal/update"] || []];
			const _next = () => {
				return (cbs.shift() ?? next).call(this, config, noSave, _next);
			};
			return _next();
		}, {
			global: true,
			prepend: true
		});
	}
	/**
	* Resolve listeners for one dispatch and apply context filtering.
	*
	* @param type — the dispatch mode, reported on `internal/dispatch`.
	* @param args — the raw dispatch arguments; consumed up to the event name.
	* @returns the matching listener callbacks, bound to the dispatch `this`.
	*/
	dispatch(type, args) {
		const thisArg = typeof args[0] === "object" || typeof args[0] === "function" ? args.shift() : null;
		const name$1 = args.shift();
		if (!name$1.startsWith("internal/")) this.emit("internal/dispatch", type, name$1, args, thisArg);
		const filter = thisArg?.[Context.filter];
		return (this._hooks[name$1] || []).filter((hook) => hook.global || !filter || filter.call(thisArg, hook.ctx)).map((hook) => hook.callback.bind(thisArg));
	}
	/**
	* Run listeners concurrently and wait for all of them.
	*
	* @param args — optional `this`, the event name, then listener arguments.
	* @returns a promise resolving once every listener has settled.
	*/
	async parallel(...args) {
		const errors = (await Promise.allSettled(this.dispatch("emit", args).map(async (cb) => cb(...args)))).filter((result) => result.status === "rejected");
		if (errors.length) throw new AggregateError(errors.map((error) => error.reason));
	}
	/**
	* Run listeners synchronously without waiting for returned promises.
	*
	* @param args — optional `this`, the event name, then listener arguments.
	*/
	emit(...args) {
		this.dispatch("emit", args).map((cb) => cb(...args));
	}
	/**
	* Run listeners in order, awaiting each, until one returns a bail value.
	*
	* @param args — optional `this`, the event name, then listener arguments.
	* @returns the first bail value (see {@link isBailed}), if any.
	*/
	async serial(...args) {
		for (const cb of this.dispatch("serial", args)) {
			const result = await cb(...args);
			if (isBailed(result)) return result;
		}
	}
	/**
	* Run listeners synchronously until one returns a bail value.
	*
	* @param args — optional `this`, the event name, then listener arguments.
	* @returns the first bail value (see {@link isBailed}), if any.
	*/
	bail(...args) {
		for (const cb of this.dispatch("bail", args)) {
			const result = cb(...args);
			if (isBailed(result)) return result;
		}
	}
	/**
	* Compose listeners around the final `next` callback.
	*
	* The last dispatch argument is treated as the innermost `next`. Listeners
	* run outermost-first; a listener that does not call `next()` vetoes the
	* rest of the chain, including the built-in behavior.
	*
	* @param args — optional `this`, the event name, listener arguments, then `next`.
	* @returns the outermost listener's return value.
	*/
	waterfall(...args) {
		const cbs = this.dispatch("waterfall", args);
		const inner = args.pop();
		const next = () => {
			return (cbs.shift() ?? inner)(...args);
		};
		args.push(next);
		return next();
	}
	/**
	* Store a listener record as an effect on the current fiber.
	*
	* @param label — effect label shown in fiber diagnostics.
	* @param hooks — the listener list for one event.
	* @param callback — the listener to store.
	* @param options — placement and filtering options.
	* @returns a disposer that unregisters the listener.
	*/
	register(label, hooks, callback, options) {
		const method = options.prepend ? "unshift" : "push";
		return this.ctx.fiber.effect(() => {
			hooks[method]({
				ctx: this.ctx,
				callback,
				...options
			});
			return () => this.unregister(hooks, callback);
		}, label);
	}
	/**
	* Remove a stored listener record.
	*
	* @param hooks — the listener list for one event.
	* @param callback — the listener to remove.
	* @returns `true` if the listener was found and removed.
	*/
	unregister(hooks, callback) {
		const index = hooks.findIndex((hook) => hook.callback === callback);
		if (index >= 0) {
			hooks.splice(index, 1);
			return true;
		}
	}
	/**
	* Register an event listener owned by the current fiber.
	*
	* The listener is removed automatically when the fiber unloads. Throws
	* `CordisError('INACTIVE_EFFECT')` if the fiber is already disposed.
	*
	* @param name — the event name to listen for.
	* @param listener — called with the dispatch arguments.
	* @param options — listener options; a boolean is shorthand for `prepend`.
	* @returns a disposer removing the listener; `true` if it was still registered.
	*/
	on(name$1, listener, options) {
		if (typeof options !== "object") options = { prepend: options };
		this.ctx.fiber.assertActive();
		listener = this.ctx.reflect.bind(listener);
		const result = this.bail(this.ctx, "internal/listener", name$1, listener, options);
		if (result) return result;
		const hooks = this._hooks[name$1] ||= [];
		const label = `ctx.on(${typeof name$1 === "string" ? JSON.stringify(name$1) : name$1.toString()})`;
		return this.register(label, hooks, listener, options);
	}
	/**
	* Register an event listener that disposes itself after the first call.
	*
	* @param name — the event name to listen for.
	* @param listener — called at most once with the dispatch arguments.
	* @param options — listener options; a boolean is shorthand for `prepend`.
	* @returns a disposer removing the listener; `true` if it was still registered.
	*/
	once(name$1, listener, options) {
		const dispose = this.on(name$1, function(...args) {
			dispose();
			return listener.apply(this, args);
		}, options);
		return dispose;
	}
};
/** Built-in placeholder formatters used by `Logger.format()`. */
const defaultFormatters = {
	s: (value) => String(value),
	d: (value) => Math.trunc(Number(value)),
	i: (value) => Math.trunc(Number(value)),
	f: (value) => Number(value),
	o: (value) => JSON.stringify(value),
	O: (value) => JSON.stringify(value),
	c: () => "",
	C: (value, exporter, message) => {
		return Logger.color(exporter, Logger.code(message.name, exporter.colors), value);
	}
};
function isAggregateError(error) {
	return error instanceof Error && Array.isArray(error["errors"]);
}
/** Logger facade for one named subsystem. */
var Logger = class {
	service;
	static color(exporter, code, value, decoration = "") {
		if (!exporter.colors) return "" + value;
		return `\u001b[3${code < 8 ? code : "8;5;" + code}${exporter.colors >= 2 ? decoration : ""}m${value}\u001b[0m`;
	}
	static code(name$1, level) {
		let hash = 0;
		for (let i = 0; i < name$1.length; i++) {
			hash = (hash << 3) - hash + name$1.charCodeAt(i) + 13;
			hash |= 0;
		}
		const colors = !level ? [] : level >= 2 ? c256 : c16;
		return colors[Math.abs(hash) % colors.length];
	}
	static format(exporter, message) {
		const args = message.args.slice();
		if (args[0] instanceof Error) {
			args[0] = args[0].stack || args[0].message;
			args.unshift("%s");
		} else if (typeof args[0] !== "string") args.unshift("%o");
		let format = args.shift();
		format = format.replace(/%([a-zA-Z%])/g, (match, char) => {
			if (match === "%%") return "%";
			const formatter = exporter.formatters?.[char] ?? defaultFormatters[char];
			if (typeof formatter === "function") return formatter(args.shift(), exporter, message);
			return match;
		});
		const oFormatter = exporter.formatters?.o ?? defaultFormatters.o;
		for (let arg of args) {
			if (typeof arg === "object" && arg) arg = oFormatter(arg, exporter, message);
			format += " " + arg;
		}
		const { maxLength = 10240 } = exporter;
		return format.split(/\r?\n/g).map((line) => {
			return line.slice(0, maxLength) + (line.length > maxLength ? "..." : "");
		}).join("\n");
	}
	constructor(options, service) {
		this.service = service;
		Object.assign(this, options);
		this.error = this._method("error", 0);
		this.info = this._method("info", 1);
		this.warn = this._method("warn", 2);
		this.debug = this._method("debug", 3);
	}
	_method(type, level) {
		return (...args) => {
			if (args.length === 1 && args[0] instanceof Error) {
				if (args[0].cause) this[type](args[0].cause);
				else if (isAggregateError(args[0])) {
					args[0].errors.forEach((error) => this[type](error));
					return;
				}
			}
			const sn = ++this.service._snMessage;
			const ts = Date.now();
			for (const exporter of this.service.exporters.values()) {
				if ((exporter.levels?.[this.name] ?? exporter.levels?.default ?? this.level ?? 1) < level) continue;
				const message = {
					sn,
					ts,
					type,
					level,
					name: this.name,
					...this.meta,
					args
				};
				exporter.export(message);
			}
		};
	}
};
/** ANSI 16-color palette indexes used for logger name coloring. */
const c16 = [
	6,
	2,
	3,
	4,
	5,
	1
];
/** ANSI 256-color palette indexes used for logger name coloring. */
const c256 = [
	20,
	21,
	26,
	27,
	32,
	33,
	38,
	39,
	40,
	41,
	42,
	43,
	44,
	45,
	56,
	57,
	62,
	63,
	68,
	69,
	74,
	75,
	76,
	77,
	78,
	79,
	80,
	81,
	92,
	93,
	98,
	99,
	112,
	113,
	129,
	134,
	135,
	148,
	149,
	160,
	161,
	162,
	163,
	164,
	165,
	166,
	167,
	168,
	169,
	170,
	171,
	172,
	173,
	178,
	179,
	184,
	185,
	196,
	197,
	198,
	199,
	200,
	201,
	202,
	203,
	204,
	205,
	206,
	207,
	208,
	209,
	214,
	215,
	220,
	221
];
/**
* Built-in logging service.
*
* Call `ctx.logger()` to create a named logger, or call `ctx.logger.info()`
* directly to log with the current fiber-derived name.
*/
var LoggerService = class LoggerService$1 {
	bufferSize = 1e3;
	buffer = [];
	ctx;
	_snMessage = 0;
	_snExporter = 0;
	exporters = /* @__PURE__ */ new Map();
	constructor(ctx) {
		const tracker = {
			property: "ctx",
			noShadow: true
		};
		const self = createCallable("logger", joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
		Object.assign(self, this);
		self.ctx = ctx;
		defineProperty(self, symbols.tracker, tracker);
		self.exporter({
			colors: 3,
			export: (message) => {
				self.buffer.push(message);
				if (self.buffer.length > self.bufferSize) self.buffer = self.buffer.slice(-self.bufferSize);
			}
		});
		return self;
	}
	/**
	* Register an exporter and dispose it with the current fiber.
	*
	* @param exporter — the sink that receives structured log messages.
	* @returns a disposer that removes the exporter.
	*/
	exporter(exporter) {
		return this.ctx.effect(() => {
			this.exporters.set(++this._snExporter, exporter);
			return () => this.exporters.delete(this._snExporter);
		}, "ctx.logger.exporter()");
	}
	_resolveConfig() {
		let intercept = this.ctx[symbols.intercept];
		const configs = [];
		while ("logger" in intercept) {
			if (Object.hasOwn(intercept, "logger")) configs.unshift(intercept["logger"]);
			intercept = Object.getPrototypeOf(intercept);
		}
		return Object.assign({}, ...configs);
	}
	[symbols.invoke](name$1) {
		const config = this._resolveConfig();
		const fiber = (this.ctx[symbols.shadow] ?? this.ctx).fiber;
		name$1 ??= config.name;
		name$1 ??= hyphenate(fiber.name);
		return new Logger({
			name: name$1,
			level: config.level,
			meta: { fiber: new WeakRef(fiber) }
		}, this);
	}
	static {
		for (const type of [
			"error",
			"info",
			"warn",
			"debug"
		]) LoggerService$1.prototype[type] = function(...args) {
			return this()[type](...args);
		};
	}
};
function enhanceError(error) {
	const lines = error.stack.split("\n");
	lines.splice(0, 2, `Error: ${error.message}`);
	error.stack = lines.join("\n");
	return error;
}
const RESERVED_WORDS = ["prototype", "then"];
function isSpecialProperty(prop) {
	return typeof prop === "symbol" || RESERVED_WORDS.includes(prop) || parseInt(prop).toString() === prop || prop.startsWith("_");
}
/**
* Reflection and service-resolution layer installed as `ctx.reflect`.
*
* This service powers the context proxy, service registration, accessors, and
* the mixins that expose core service methods directly on `ctx`.
*/
var ReflectService = class {
	ctx;
	/** Proxy traps implementing service resolution for every context object. */
	static handler = {
		get: (target, prop, ctx) => {
			if (isSpecialProperty(prop)) return Reflect.get(target, prop, ctx);
			if (Reflect.has(target, prop)) return getTraceable(ctx, Reflect.get(target, prop, ctx));
			const error = /* @__PURE__ */ new Error(`cannot get property "${prop}" without inject`);
			try {
				const def = target.reflect.props[prop];
				if (def?.type === "accessor") return def.get.call(ctx, ctx[symbols.receiver], error);
				if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false);
				return ctx.events.waterfall("internal/get", ctx, prop, error, () => {
					const key = target[symbols.isolate][prop];
					let fiber = (ctx[symbols.shadow] ?? ctx).fiber;
					while (true) {
						const impl = fiber.store?.[prop];
						if (impl) return getTraceable(ctx, impl.value);
						if (prop in fiber.inject) {
							error.message = `cannot get required service "${prop}" in inactive context`;
							throw error;
						}
						if (!fiber.runtime) throw error;
						if (fiber.parent[symbols.isolate][prop] !== key) throw error;
						fiber = fiber.parent.fiber;
					}
				});
			} catch (e) {
				throw e === error ? enhanceError(e) : e;
			}
		},
		set: (target, prop, value, ctx) => {
			if (isSpecialProperty(prop)) return Reflect.set(target, prop, value, ctx);
			const error = /* @__PURE__ */ new Error(`cannot set property "${prop}" without provide`);
			const def = target.reflect.props[prop];
			if (!def) {
				if (!ctx.fiber.runtime) return Reflect.set(target, prop, value, ctx);
				throw enhanceError(error);
			}
			try {
				if (def.type === "accessor") {
					if (!def.set) return false;
					return def.set.call(ctx, value, ctx[symbols.receiver], error);
				}
				return ctx.events.waterfall("internal/set", ctx, prop, value, error, () => {
					return ctx.reflect.set(prop, value, error);
				});
			} catch (e) {
				throw e === error ? enhanceError(e) : e;
			}
		},
		has: (target, prop) => {
			if (isSpecialProperty(prop)) return Reflect.has(target, prop);
			if (Reflect.has(target, prop)) return true;
			return !!target.reflect.props[prop];
		}
	};
	/** Service implementations, keyed by isolation label. */
	store = Object.create(null);
	/** Declared context properties (services and accessors), by name. */
	props = Object.create(null);
	constructor(ctx) {
		this.ctx = ctx;
		defineProperty(this, symbols.tracker, {
			property: "ctx",
			noShadow: true
		});
		this.mixin("reflect", [
			"get",
			"set",
			"provide",
			"accessor",
			"mixin"
		]);
		this.mixin("fiber", ["runtime", "effect"]);
		this.mixin("registry", ["inject", "plugin"]);
		this.mixin("events", [
			"on",
			"once",
			"parallel",
			"emit",
			"serial",
			"bail",
			"waterfall"
		]);
	}
	/**
	* Read a service from the store without the inject requirement.
	*
	* @param name — the service name.
	* @param strict — when `true`, only return implementations whose providing
	* fiber is currently active.
	* @returns the service value, or `undefined` when not (yet) provided.
	*/
	get(name$1, strict = true) {
		return getTraceable(this.ctx, this._getImpl(name$1, strict)?.value);
	}
	_getImpl(name$1, strict = true) {
		const key = this.ctx[symbols.isolate][name$1];
		const impl = key && this.store[key];
		if (!impl) return;
		if (strict && impl.fiber.state !== 2) return;
		return impl;
	}
	/**
	* Overwrite a provided service's value.
	*
	* @param name — the service name.
	* @param value — the new service value.
	* @param error — carrier for the caller stack in diagnostics.
	* @returns `true` on success.
	* @throws when `name` was never provided, or was provided by another fiber.
	*/
	set(name$1, value, error) {
		const key = this.ctx[symbols.isolate][name$1];
		const impl = this.store[key];
		if (!impl) throw new Error(`cannot set property "${name$1}" without provide`);
		if (impl.fiber !== this.ctx.fiber) throw new Error(`cannot set property "${name$1}" in multiple fibers`);
		impl.value = value;
		return true;
	}
	/**
	* Register a service implementation owned by the current fiber.
	*
	* See the `ctx.provide()` overload above for the full contract.
	*
	* @param name — the service name.
	* @param value — the service value.
	* @param check — optional availability predicate for dependents.
	* @returns a disposer that unregisters the service.
	*/
	provide(name$1, value, check) {
		return this.ctx.fiber.effect(() => {
			if (!this.props[name$1]) this.props[name$1] ??= { type: "service" };
			else if (this.props[name$1].type !== "service") throw new Error(`property "${name$1}" is already declared as ${this.props[name$1].type}`);
			this.props[name$1] = { type: "service" };
			this.ctx.root[symbols.isolate][name$1] ??= Symbol(name$1);
			const key = this.ctx[symbols.isolate][name$1];
			const impl = {
				name: name$1,
				value,
				fiber: this.ctx.fiber,
				check
			};
			if (this.store[key]) throw new Error(`service "${name$1}" has been registered at <${this.store[key].fiber.name}>`);
			this.store[key] = impl;
			this.ctx.fiber.store[name$1] = impl;
			if (this.ctx.fiber.state === 2) this.notify([name$1]);
			return async () => {
				delete this.store[key];
				const fibers = this.notify([name$1]);
				await Promise.allSettled(fibers.map((fiber) => fiber.await()));
				delete this.ctx.fiber.store[name$1];
			};
		}, `ctx.provide(${JSON.stringify(name$1)})`);
	}
	/**
	* Re-evaluate every fiber that requires one of the given services.
	*
	* @param names — the service names that changed.
	* @param filter — restricts notification to matching isolation scopes.
	* @returns the fibers whose dependency state was refreshed.
	*/
	notify(names, filter = (ctx, name$1) => ctx[symbols.isolate][name$1] === this.ctx[symbols.isolate][name$1]) {
		const fibers = [];
		for (const runtime of this.ctx.registry.values()) for (const fiber of runtime.fibers) {
			let hasUpdate = false;
			for (const name$1 of names) {
				if (!(name$1 in fiber.inject)) continue;
				if (!filter(fiber.ctx, name$1)) continue;
				hasUpdate = true;
				fiber._checkImpl(name$1);
			}
			if (!hasUpdate) continue;
			fiber._refresh();
			fibers.push(fiber);
		}
		for (const name$1 of names) {
			const self = Object.create(this.ctx);
			self[symbols.filter] = (target) => filter(target, name$1);
			this.ctx.events.emit(self, "internal/service", name$1, this._getImpl(name$1, false)?.value);
		}
		return fibers;
	}
	/**
	* Define a computed context property backed by get/set hooks.
	*
	* @param name — the context property name.
	* @param options — the `get` hook and optional `set` hook.
	* @returns a disposer that removes the accessor.
	*/
	accessor(name$1, options) {
		return this.ctx.fiber.effect(() => {
			if (name$1 in this.props) throw new Error(`property "${name$1}" is already declared as ${this.props[name$1].type}`);
			this.props[name$1] = {
				type: "accessor",
				...options
			};
			return () => delete this.props[name$1];
		}, `ctx.accessor(${JSON.stringify(name$1)})`);
	}
	/**
	* Expose selected members of a service directly on `ctx`.
	*
	* See the `ctx.mixin()` overload above for the full contract.
	*
	* @param source — a context property name or a source object.
	* @param mixins — keys to forward, or a source-key → ctx-key map.
	* @returns a disposer that removes all created accessors.
	*/
	mixin(source, mixins) {
		const self = this;
		return this.ctx.fiber.effect(function* () {
			const entries = Array.isArray(mixins) ? mixins.map((key) => [key, key]) : Object.entries(mixins);
			const getTarget = (ctx, error) => {
				return ctx[source];
			};
			for (const [key, value] of entries) yield self.accessor(value, {
				get(receiver, error) {
					const service = getTarget(this, error);
					if (isNullable(service)) return service;
					const mixin = receiver ? withProps(receiver, service) : service;
					const value$1 = Reflect.get(service, key, mixin);
					if (typeof value$1 !== "function") return value$1;
					return value$1.bind(mixin ?? service);
				},
				set(value$1, receiver, error) {
					const service = getTarget(this, error);
					const mixin = receiver ? withProps(receiver, service) : service;
					return Reflect.set(service, key, value$1, mixin);
				}
			});
		}, `ctx.mixin(${JSON.stringify(source)})`);
	}
	/**
	* Attach this context's tracing wrapper to a value.
	*
	* @param value — the value to wrap.
	* @returns the traceable wrapper (or the value itself when not applicable).
	*/
	trace(value) {
		return getTraceable(this.ctx, value);
	}
	/**
	* Wrap a callback so calls trace `this` and arguments to this context.
	*
	* @param callback — the function to wrap.
	* @returns a proxy delegating to `callback` with traced values.
	*/
	bind(callback) {
		return new Proxy(callback, {
			apply: (target, thisArg, args) => {
				return Reflect.apply(target, this.trace(thisArg), args.map((arg) => this.trace(arg)));
			},
			construct: (target, args, newTarget) => {
				return Reflect.construct(target, args.map((arg) => this.trace(arg)), newTarget);
			}
		});
	}
};
const kValidationError = Symbol.for("ValidationError");
/** Error raised when plugin configuration fails standard-schema validation. */
var ValidationError = class extends TypeError {
	name = "ValidationError";
	/**
	* Build the aggregated message from schema issues.
	*
	* @param issues — the standard-schema issues, one message line each.
	*/
	constructor(issues) {
		super(`invalid config:\n` + issues.map((issue) => {
			if (issue.path) return `  - ${issue.message} (at ${issue.path.join(".")})`;
			else return `  - ${issue.message}`;
		}).join("\n"));
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
/**
* Validate and normalize config for a plugin runtime before it starts.
*
* @param runtime — the plugin runtime whose `Config` schema to apply.
* @param config — the raw user config.
* @returns the validated config, or `config` unchanged if the runtime has no schema.
* @throws {ValidationError} when validation reports issues.
*/
function resolveConfig$1(runtime, config) {
	if (!runtime.Config) return config;
	const result = runtime.Config["~standard"].validate(config);
	if ("then" in result) throw new TypeError("Async config validation is not supported");
	if (result.issues) throw new ValidationError(result.issues);
	else return result.value;
}
const effectInertia = /* @__PURE__ */ new WeakMap();
function runDisposable(dispose) {
	const result = dispose();
	return effectInertia.get(dispose)?.() ?? result;
}
/** Notify plugin teardown without allowing one observer to break ownership cleanup. */
function emitPluginDisposed(context, fiber) {
	const args = ["internal/plugin", fiber];
	let callbacks;
	try {
		callbacks = context.events.dispatch("emit", args);
	} catch (error) {
		context.logger.error(error);
		return;
	}
	for (const callback of callbacks) try {
		const returned = callback(...args);
		Promise.resolve(returned).catch((error) => context.logger.error(error));
	} catch (error) {
		context.logger.error(error);
	}
}
/** Framework error with a stable machine-readable code. */
var CordisError = class CordisError$1 extends Error {
	code;
	/**
	* @param code — the stable error code; also the default message.
	* @param message — optional human-readable override.
	*/
	constructor(code, message) {
		super(message ?? CordisError$1.Code[code]);
		this.code = code;
	}
};
/** Cordis error code definitions. */
(function(CordisError$1) {
	CordisError$1.Code = { INACTIVE_EFFECT: "cannot create effect on inactive context" };
})(CordisError || (CordisError = {}));
const INACTIVE = "__INACTIVE__";
/**
* Runtime instance of one plugin application.
*
* A fiber tracks dependency state, validated config, lifecycle effects, and
* cleanup for the plugin context returned by `ctx.plugin()`.
*/
var Fiber = class {
	parent;
	inject;
	runtime;
	/** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
	uid;
	/** The context this fiber's plugin runs in (extends the parent context). */
	ctx;
	/** The validated plugin config (updated by `update()`). */
	config;
	/** The raw plugin config, re-resolved before each activation. */
	_config;
	/** Current lifecycle state; transitions emit `internal/status`. */
	state = 0;
	/** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
	dispose;
	/** Snapshot of required service implementations while loaded; `undefined` otherwise. */
	store;
	/** The in-flight load/unload transition, if one is currently running. */
	inertia;
	_hooks = Object.create(null);
	_disposables = new DisposableList();
	context;
	_error;
	_runner;
	_store = Object.create(null);
	/**
	* Create a fiber. Plugin authors normally obtain fibers from `ctx.plugin()`
	* rather than constructing them directly.
	*
	* @param parent — the context the plugin was loaded from.
	* @param config — raw config, validated against the runtime's schema.
	* @param inject — resolved dependency map (service name → intercept config).
	* @param runtime — the shared plugin runtime, or `null` for the root fiber.
	* @param getOuterStack — captures the caller stack for effect diagnostics.
	*/
	constructor(parent, config, inject$1, runtime, getOuterStack) {
		this.parent = parent;
		this.inject = inject$1;
		this.runtime = runtime;
		this._config = config;
		const collect = (dispose) => {
			this._disposables.push(dispose);
		};
		if (runtime) {
			this.uid = parent.registry.counter;
			this.ctx = this.context = parent.extend({ fiber: this });
			const injectEntries = Object.entries(this.inject);
			if (injectEntries.length) {
				this.ctx[Context.intercept] = Object.create(parent[Context.intercept]);
				for (const [name$1, config$1] of injectEntries) {
					if (isNullable(config$1)) continue;
					this.ctx[Context.intercept][name$1] = config$1;
				}
			}
			this._runner = {
				epoch: INACTIVE,
				getOuterStack,
				execute: function() {
					if (isConstructor(runtime.callback)) {
						const instance = new runtime.callback(this.ctx, this.config);
						for (const hook of instance?.[symbols.initHooks] ?? []) hook();
						return instance?.[symbols.init]?.();
					} else return runtime.callback(this.ctx, this.config);
				},
				collect
			};
			this.dispose = parent.fiber.effect(() => {
				const remove = runtime.fibers.push(this);
				return async () => {
					this.uid = null;
					emitPluginDisposed(this.context, this);
					if (this.ctx.registry.has(runtime.callback)) {
						remove();
						if (!runtime.fibers.length) this.ctx.registry.delete(runtime.callback);
					}
					this._setEpoch(INACTIVE);
					if (!this.inertia) this._updateState(() => {
						this.inertia = this._unload();
						return 5;
					});
					while (this.inertia) await this.inertia;
				};
			}, "ctx.plugin()");
			try {
				this.context.emit("internal/plugin", this);
			} catch (error) {
				Promise.resolve(this.dispose()).catch((reason) => this.ctx.logger.error(reason));
				throw error;
			}
			if (this.uid !== null && parent.fiber.state !== 5) {
				for (const name$1 of Object.keys(this.inject)) this._checkImpl(name$1);
				this._refresh();
			}
		} else {
			this.uid = 0;
			this.ctx = this.context = parent;
			this.state = 2;
			this.store = Object.create(null);
			this._runner = {
				epoch: "",
				getOuterStack,
				execute: () => {},
				collect
			};
			this.dispose = () => this.restart();
		}
	}
	/** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
	get name() {
		let fiber = this;
		do {
			if (fiber.runtime?.name) return fiber.runtime.name;
			fiber = fiber.parent.fiber;
		} while (fiber !== fiber.parent.fiber);
		return "root";
	}
	/**
	* Throw if the fiber has already been disposed.
	*
	* @returns nothing when the fiber is still active.
	* @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
	*/
	assertActive() {
		if (this.uid !== null) return;
		throw new CordisError("INACTIVE_EFFECT");
	}
	_execute(runner) {
		const oldEpoch = runner.epoch;
		return composeError((info) => {
			const safeCollect = (dispose) => {
				if (typeof dispose === "function") runner.collect(dispose);
				else if (!isNullable(dispose)) throw new TypeError("Invalid effect");
			};
			const effect = runner.execute.call(this);
			if (typeof effect === "function") return runner.collect(effect);
			else if (isNullable(effect)) {} else if (!isObject(effect)) throw new TypeError("Invalid effect");
			else if ("then" in effect) return effect.then(safeCollect);
			else if (Symbol.iterator in effect) {
				info.error = /* @__PURE__ */ new Error();
				const iter = effect[Symbol.iterator]();
				while (true) {
					const result = iter.next();
					safeCollect(result.value);
					if (result.done) return;
				}
			} else if (Symbol.asyncIterator in effect) {
				const iter = effect[Symbol.asyncIterator]();
				return (async () => {
					await Promise.resolve();
					info.error = /* @__PURE__ */ new Error();
					while (true) {
						if (runner.epoch !== oldEpoch) return;
						const result = await iter.next();
						safeCollect(result.value);
						if (result.done) return;
					}
				})();
			} else throw new TypeError("Invalid effect");
		}, runner.getOuterStack);
	}
	effect(execute, label = "anonymous") {
		this.assertActive();
		if (this.state === 5) throw new CordisError("INACTIVE_EFFECT");
		const disposables = [];
		let disposing = false;
		let disposalTask;
		const dispose = () => {
			if (disposing) return disposalTask;
			disposing = true;
			let task$1;
			for (const disposable of disposables.splice(0).reverse()) if (task$1) task$1 = task$1.then(() => runDisposable(disposable));
			else {
				const result = runDisposable(disposable);
				if (isObject(result) && "then" in result) task$1 = result;
			}
			return disposalTask = task$1;
		};
		const meta = {
			label,
			children: []
		};
		const runner = {
			execute,
			epoch: true,
			collect: (dispose$1) => {
				disposables.push(dispose$1);
				this._disposables.delete(dispose$1);
				if (dispose$1[symbols.effect]) meta.children.push(dispose$1[symbols.effect]);
			},
			getOuterStack: buildOuterStack()
		};
		let task;
		let executing = true;
		let resolveSetup;
		let rejectSetup;
		let setupBarrier;
		let setupFailed = false;
		let inFlight;
		let removeWrapper = () => false;
		const waitForSetup = () => {
			setupBarrier ??= new Promise((resolve, reject) => {
				resolveSetup = resolve;
				rejectSetup = reject;
			});
			return setupBarrier;
		};
		const disposeAfter = (setup) => {
			return Promise.resolve(setup).then(() => dispose(), async (reason) => {
				await dispose();
				throw reason;
			});
		};
		const finalizeDisposal = (callback) => {
			let result;
			try {
				result = callback();
			} catch (error) {
				removeWrapper();
				throw error;
			}
			if (isObject(result) && "then" in result) {
				const pending = Promise.resolve(result).finally(() => {
					removeWrapper();
					if (inFlight === pending) inFlight = void 0;
				});
				return inFlight = pending;
			}
			removeWrapper();
			return result;
		};
		const wrapper = defineProperty(() => {
			if (!runner.epoch) return setupFailed ? inFlight : void 0;
			runner.epoch = false;
			return finalizeDisposal(() => {
				if (executing) return disposeAfter(waitForSetup());
				return task ? disposeAfter(task) : dispose();
			});
		}, symbols.effect, meta);
		effectInertia.set(wrapper, () => inFlight);
		removeWrapper = this._disposables.push(wrapper);
		try {
			task = this._execute(runner);
		} catch (reason) {
			executing = false;
			setupFailed = true;
			runner.epoch = false;
			let cleanup;
			try {
				cleanup = finalizeDisposal(dispose);
			} finally {
				rejectSetup?.(reason);
			}
			if (isObject(cleanup) && "then" in cleanup) cleanup.catch((error) => this.ctx.logger.error(error));
			throw reason;
		}
		executing = false;
		if (setupBarrier) Promise.resolve(task).then(resolveSetup, rejectSetup);
		task?.catch(() => {
			if (!runner.epoch) return dispose();
			return finalizeDisposal(dispose);
		}).catch((error) => this.ctx.logger.error(error));
		const disposeAsync = () => {
			if (!runner.epoch) return;
			runner.epoch = false;
			return finalizeDisposal(dispose);
		};
		wrapper.then = async (onFulfilled, onRejected) => {
			return Promise.resolve(task).then(() => disposeAsync).then(onFulfilled, onRejected);
		};
		return wrapper;
	}
	/**
	* Return metadata for currently registered effects.
	*
	* @returns one {@link EffectMeta} tree per labeled live effect.
	*/
	getEffects() {
		return [...this._disposables].map((dispose) => dispose[symbols.effect]).filter(Boolean);
	}
	_getState() {
		if (this.uid === null) return 4;
		if (this._error) return 3;
		if (this._runner.epoch !== INACTIVE) return 2;
		return 0;
	}
	_updateState(callback) {
		const oldState = this.state;
		this.state = callback() ?? this._getState();
		if (oldState === this.state) return;
		this.context.emit("internal/status", this, oldState);
		if (oldState !== 2 && this.state !== 2) return;
		for (const key of Reflect.ownKeys(this.ctx.reflect.store)) {
			const impl = this.ctx.reflect.store[key];
			if (impl.fiber !== this) continue;
			this.ctx.reflect.notify([impl.name]);
		}
	}
	_checkImpl(name$1) {
		const impl = this.ctx.reflect._getImpl(name$1, true);
		if (!impl) return delete this._store[name$1];
		try {
			if (impl.check && !impl.check.call(getTraceable(this.ctx, impl.value))) return delete this._store[name$1];
		} catch (error) {
			impl.fiber.ctx.logger.error(error);
			return delete this._store[name$1];
		}
		this._store[name$1] = impl;
	}
	_refresh() {
		let epoch = false;
		epoch = "";
		for (const name$1 of Object.keys(this.inject)) {
			const impl = this._store[name$1];
			if (!impl) {
				epoch = INACTIVE;
				break;
			}
			epoch += ":" + impl.fiber.uid;
		}
		this._setEpoch(epoch);
	}
	_setEpoch(epoch) {
		const oldEpoch = this._runner.epoch;
		if (epoch === oldEpoch) return;
		this._runner.epoch = epoch;
		if (this.inertia) return;
		this._updateState(() => {
			if (epoch !== INACTIVE && oldEpoch === INACTIVE) {
				this.inertia = this._reload();
				return 1;
			} else {
				this.inertia = this._unload();
				return 5;
			}
		});
	}
	_resolveConfig(config) {
		config = this.context.waterfall(this, "internal/config", config, () => config);
		return this.runtime ? resolveConfig$1(this.runtime, config) : config;
	}
	async _reload() {
		this.store = { ...this._store };
		const oldEpoch = this._runner.epoch;
		try {
			await Promise.resolve();
			if (this._runner.epoch === oldEpoch) {
				this.config = this._resolveConfig(this._config);
				await this._execute(this._runner);
				this._error = void 0;
			}
		} catch (reason) {
			this.ctx.logger.error(reason);
			this._error = reason;
			this._runner.epoch = INACTIVE;
		}
		this._updateState(() => {
			if (this._runner.epoch === oldEpoch) this.inertia = void 0;
			else {
				this.inertia = this._unload();
				return 5;
			}
		});
	}
	async _unload() {
		await Promise.all(this._disposables.clear().map(async (dispose) => {
			try {
				await composeError(async (info) => {
					await Promise.resolve();
					info.error = /* @__PURE__ */ new Error();
					await runDisposable(dispose);
				}, this._runner.getOuterStack);
			} catch (reason) {
				this.ctx.logger.error(reason);
			}
		}));
		this.store = void 0;
		this._updateState(() => {
			if (this._runner.epoch === INACTIVE) this.inertia = void 0;
			else {
				this.inertia = this._reload();
				return 1;
			}
		});
	}
	/**
	* Wait for current lifecycle work and rethrow startup errors.
	*
	* @returns this fiber, once it has settled into a stable state.
	* @throws the config-validation or plugin-startup error, if any.
	*/
	async await() {
		while (this.inertia) await this.inertia;
		if (this._error) throw this._error;
		return this;
	}
	/**
	* Dispose and immediately reload this plugin with its current config.
	*
	* @returns a promise resolving once the reload settled.
	* @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
	*/
	async restart() {
		this.assertActive();
		this._setEpoch(INACTIVE);
		this._refresh();
		await this.await();
	}
	/**
	* Validate and apply new config, then restart the plugin.
	*
	* Runs the `internal/update` waterfall first, so update hooks (and HMR)
	* can veto or replace the restart.
	*
	* @param config — the new raw config; validated before anything restarts.
	* @param noSave — hint for persistence hooks not to write the change back.
	* @returns the update waterfall result; the default restart returns a promise.
	* @throws when validation, an update listener, or the restarted plugin fails.
	*/
	update(config, noSave = false) {
		this.assertActive();
		this._config = config;
		if (this.state !== 2) {
			this._error = void 0;
			this._setEpoch(INACTIVE);
			this._refresh();
			return;
		}
		config = this._resolveConfig(config);
		return this.context.waterfall(this, "internal/update", config, noSave, () => {
			this.config = config;
			this._error = void 0;
			return this.restart();
		});
	}
};
function isApplicable(object) {
	return object && typeof object === "object" && typeof object.apply === "function";
}
/**
* Decorator for declaring service dependencies on classes or class methods.
*
* On classes it contributes to the plugin's static `inject` map. On methods it
* delays the method call until the declared services are available.
*/
/**
* @param name — the required service name.
* @param config — optional intercept config applied for that service.
* @returns the class or method decorator.
*/
function Inject(name$1, config) {
	return function(value, decorator) {
		if (decorator.kind === "class") {
			if (!Object.hasOwn(value, "inject")) {
				defineProperty(value, "inject", Object.create(Object.getPrototypeOf(value).inject ?? null));
				defineProperty(value.inject, symbols.checkProto, true);
			}
			value.inject[name$1] = config;
		} else if (decorator.kind === "method") {
			const inject$1 = (value[symbols.metadata] ??= {}).inject ??= Object.create(null);
			inject$1[name$1] = config;
			decorator.addInitializer(function() {
				const property = this[symbols.tracker]?.property;
				(this[symbols.initHooks] ??= []).push(() => {
					this.ctx.inject(inject$1, (ctx) => {
						return value.call(property ? withProps(this, { [property]: ctx }) : this);
					});
				});
			});
		} else throw new Error("@Inject() can only be used on class or class methods");
	};
}
/** Utilities for normalizing plugin dependency declarations. */
(function(Inject$1) {
	/**
	* Convert array/object/class-inherited inject metadata into a plain map.
	*
	* @param inject — the declaration to normalize; `null`/`undefined` add nothing.
	* @param result — the map to fill (service name → intercept config or `null`).
	* @returns `result`.
	*/
	function resolve(inject$1, result = Object.create(null)) {
		if (!inject$1) return result;
		if (Array.isArray(inject$1)) for (const name$1 of inject$1) result[name$1] = null;
		else if (Reflect.has(inject$1, symbols.checkProto)) {
			Object.assign(result, resolve(Object.getPrototypeOf(inject$1)));
			for (const name$1 of Object.keys(inject$1)) result[name$1] = inject$1[name$1] ?? null;
		} else for (const name$1 of Object.keys(inject$1)) result[name$1] = inject$1[name$1] ?? null;
		return result;
	}
	Inject$1.resolve = resolve;
})(Inject || (Inject = {}));
/**
* Plugin registry installed as `ctx.registry` and mixed into every context.
*
* It normalizes plugin shapes, tracks plugin runtimes, starts fibers, and
* exposes map-like inspection over active plugin callbacks.
*/
var RegistryService = class {
	ctx;
	_counter = 0;
	_internal = /* @__PURE__ */ new Map();
	constructor(ctx) {
		this.ctx = ctx;
		defineProperty(this, symbols.tracker, {
			property: "ctx",
			noShadow: true
		});
	}
	/** Allocate the next fiber uid (increments on every read). */
	get counter() {
		return ++this._counter;
	}
	/** Number of registered plugin runtimes. */
	get size() {
		return this._internal.size;
	}
	/**
	* Resolve a supported plugin shape to its executable callback.
	*
	* @param plugin — a function, class, or `{ apply }` object plugin.
	* @returns the callback identifying the plugin, or `undefined` if invalid.
	*/
	resolve(plugin) {
		try {
			if (typeof plugin === "function") return plugin;
			if (isApplicable(plugin)) return plugin.apply;
		} catch {}
	}
	/**
	* Look up the runtime record for a plugin.
	*
	* @param plugin — any supported plugin shape.
	* @returns the runtime, or `undefined` when the plugin is not registered.
	*/
	get(plugin) {
		const key = this.resolve(plugin);
		return key && this._internal.get(key);
	}
	/**
	* Check whether a plugin has a registered runtime.
	*
	* @param plugin — any supported plugin shape.
	* @returns `true` when at least one fiber of the plugin exists.
	*/
	has(plugin) {
		const key = this.resolve(plugin);
		return !!key && this._internal.has(key);
	}
	/**
	* Dispose every running fiber for a plugin and remove its runtime record.
	*
	* @param plugin — any supported plugin shape.
	* @returns the removed runtime, or `undefined` when none was registered.
	*/
	delete(plugin) {
		const key = this.resolve(plugin);
		const runtime = key && this._internal.get(key);
		if (!runtime) return;
		this._internal.delete(key);
		for (const fiber of runtime.fibers) fiber.dispose();
		return runtime;
	}
	/** Iterate the registered plugin callbacks. */
	keys() {
		return this._internal.keys();
	}
	/** Iterate the registered plugin runtimes. */
	values() {
		return this._internal.values();
	}
	/** Iterate `[callback, runtime]` pairs. */
	entries() {
		return this._internal.entries();
	}
	/**
	* Visit every registered runtime.
	*
	* @param callback — receives each runtime and its identifying callback.
	*/
	forEach(callback) {
		return this._internal.forEach(callback);
	}
	/**
	* Start a callback once the requested dependencies are available.
	*
	* @param inject — required services, as an array or a name → config map.
	* @param callback — plugin body called with `(ctx, config)`.
	* @returns the fiber; awaiting it settles once loading finished.
	*/
	inject(inject$1, callback) {
		return this.plugin({
			inject: inject$1,
			apply: callback,
			name: callback.name
		});
	}
	/**
	* Start a plugin in the current context and return its fiber.
	*
	* Creates (or reuses) the plugin's runtime record, then starts a new fiber
	* under the current context. Throws if `plugin` is not a supported shape or
	* if the current fiber is already disposed.
	*
	* @param plugin — a function, class, or `{ apply }` object plugin.
	* @param config — the plugin config, validated against its `Config` schema.
	* @param getOuterStack — captures the caller stack for effect diagnostics.
	* @returns the fiber; awaiting it settles once loading finished.
	*/
	plugin(plugin, config, getOuterStack = buildOuterStack()) {
		const callback = this.resolve(plugin);
		if (!callback) throw new Error("invalid plugin, expect function or object with an \"apply\" method, received " + typeof plugin);
		this.ctx.fiber.assertActive();
		let runtime = this._internal.get(callback);
		if (!runtime) {
			let name$1 = plugin.name;
			if (name$1 === "apply") name$1 = void 0;
			runtime = {
				name: name$1,
				callback,
				fibers: new DisposableList(),
				Config: plugin.Config
			};
			this._internal.set(callback, runtime);
		}
		const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack);
		const wrapped = Object.create(fiber);
		wrapped.then = (onFulfilled, onRejected) => {
			return fiber.await().then(onFulfilled, onRejected);
		};
		return wrapped;
	}
};
/**
* Root and child dependency containers for Cordis plugins.
*
* A context is a proxy: normal property reads go through the service resolver,
* while `extend()`, `isolate()`, and `intercept()` create scoped child
* contexts without mutating their parent.
*/
var Context = class Context$1 {
	/** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
	static effect = symbols.effect;
	/** Symbol key for a context's listener filter, consulted on every event dispatch. */
	static filter = symbols.filter;
	/** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
	static isolate = symbols.isolate;
	/** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
	static intercept = symbols.intercept;
	/**
	* Returns true for Cordis context proxies and context prototypes.
	*
	* Works across realms and across multiple copies of cordis, because the
	* brand is keyed by a global symbol rather than by `instanceof`.
	*
	* @param value — the value to test.
	* @returns `true` if `value` is a Cordis context, narrowing its type.
	*/
	static is(value) {
		return !!value?.[Context$1.is];
	}
	static {
		Context$1.is[Symbol.toPrimitive] = () => Symbol.for("cordis.is");
		Context$1.prototype[Context$1.is] = true;
	}
	/** Create the root context and install the built-in services. */
	constructor() {
		this[symbols.isolate] = Object.create(null);
		this[symbols.intercept] = Object.create(null);
		const self = new Proxy(this, ReflectService.handler);
		this.root = self;
		this.baseUrl = void 0;
		this.fiber = new Fiber(self, {}, Object.create(null), null, () => []);
		this.reflect = new ReflectService(self);
		this.registry = new RegistryService(self);
		this.events = new EventsService(self);
		this.logger = new LoggerService(self);
		this.fiber._disposables.clear();
		return self;
	}
	[Symbol.for("nodejs.util.inspect.custom")]() {
		return `Context <${this.fiber.name}>`;
	}
	/**
	* Create a child context with extra metadata on top of the current scope.
	*
	* The child prototypally inherits every property of this context; own
	* properties of `meta` shadow the inherited ones. The parent is not mutated.
	*
	* @param meta — own properties (including symbol keys) to define on the child.
	* @returns a child context inheriting from this one.
	*/
	extend(meta = {}) {
		const shadow = Reflect.getOwnPropertyDescriptor(this, symbols.shadow)?.value;
		const self = Object.create(getTraceable(this, this));
		for (const prop of Reflect.ownKeys(meta)) Object.defineProperty(self, prop, Reflect.getOwnPropertyDescriptor(meta, prop));
		if (!shadow) return self;
		return Object.assign(Object.create(self), { [symbols.shadow]: shadow });
	}
	/**
	* Create a child context with an independent service scope for `name`.
	*
	* Below the returned context, reads and writes of the service `name`
	* resolve against the new label instead of the parent's, so a different
	* implementation can be provided without affecting the parent scope.
	* Passing the same `label` to two `isolate()` calls joins their scopes.
	*
	* @param name — the service name to isolate.
	* @param label — scope label to join; defaults to a fresh unique symbol.
	* @returns a child context whose `name` service resolves in the new scope.
	*/
	isolate(name$1, label) {
		const shadow = Object.create(this[symbols.isolate]);
		shadow[name$1] = label ?? Symbol(name$1);
		return this.extend({ [symbols.isolate]: shadow });
	}
	intercept(name$1, config) {
		const intercept = Object.create(this[symbols.intercept]);
		intercept[name$1] = config;
		return this.extend({ [symbols.intercept]: intercept });
	}
};
/**
* Base class for services that expose a named API on `ctx`.
*
* Subclasses call `super(ctx, name)` from their constructor. The service is
* registered immediately and is automatically removed with the owning fiber.
*/
var Service = class Service$1 {
	ctx;
	/** Symbol key of an instance method run after construction (class plugins). */
	static init = symbols.init;
	/** Symbol key of the availability predicate passed to `ctx.provide()`. */
	static check = symbols.check;
	/** Symbol key of the phantom intercept-config type parameter. */
	static config = symbols.config;
	/** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
	static invoke = symbols.invoke;
	/** Symbol key of the helper deriving an extended service instance. */
	static extend = symbols.extend;
	/** Symbol key of the tracker metadata used for context tracing. */
	static tracker = symbols.tracker;
	/** Symbol key of the intercept-config resolution helper below. */
	static resolveConfig = symbols.resolveConfig;
	/** The service name this instance is registered under. */
	name;
	/**
	* Register this instance as `name` in the current context.
	*
	* Calls `ctx.reflect.provide(name, this, this[Service.check])`, so the
	* service is unregistered automatically when the owning fiber unloads.
	* Services with a `[Service.invoke]` body return a callable instance.
	*
	* @param ctx — the context to register in (stored as `this.ctx`).
	* @param name — the service name; defaults to the static `provide` field.
	*/
	constructor(ctx, name$1) {
		this.ctx = ctx;
		name$1 ??= this.constructor["provide"];
		let self = this;
		const tracker = {
			associate: name$1,
			property: "ctx"
		};
		if (self[symbols.invoke]) self = createCallable(name$1, joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
		self.ctx = ctx;
		self.name = name$1;
		defineProperty(self, symbols.tracker, tracker);
		self.ctx.reflect.provide(name$1, self, this[symbols.check]);
		return self;
	}
	[symbols.filter](ctx) {
		return ctx[symbols.isolate][this.name] === this.ctx[symbols.isolate][this.name];
	}
	[symbols.extend](props) {
		let self;
		if (this[Service$1.invoke]) self = createCallable(this.name, this, this[symbols.tracker]);
		else self = Object.create(this);
		return Object.assign(self, props);
	}
	/**
	* Merge intercept config from ancestors with optional base and head values.
	*
	* Entries added closer to the root apply first; `base` is prepended and
	* `head` appended. Uses `Config.merge` when the service declares one,
	* otherwise a shallow `Object.assign`.
	*
	* @param base — lowest-precedence config merged before all intercepts.
	* @param head — highest-precedence config merged after all intercepts.
	* @returns the merged config.
	*/
	[symbols.resolveConfig](base, head) {
		let intercept = this.ctx[Context.intercept];
		const configs = [];
		while (this.name in intercept) {
			if (Object.hasOwn(intercept, this.name)) configs.unshift(intercept[this.name]);
			intercept = Object.getPrototypeOf(intercept);
		}
		if (base) configs.unshift(base);
		if (head) configs.push(head);
		if (this["Config"]?.merge) return this["Config"].merge(...configs);
		else return Object.assign({}, ...configs);
	}
	static [Symbol.hasInstance](instance) {
		if (!instance) return false;
		let constructor = instance.constructor;
		while (constructor) {
			constructor = constructor.prototype?.constructor;
			if (constructor === this) return true;
			constructor &&= Object.getPrototypeOf(constructor);
		}
		return false;
	}
};

//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-settings@0_02aaf429ec98c58247037e2222c17a8f/node_modules/@deepseek-ai/dsh-settings/lib/index.js
/**
* Structural secret redaction for settings values. `role('secret')` fields are
* removed from a value before it crosses a wire boundary; a sidecar records
* each schema-declared secret position and whether it currently holds a value,
* so a configuration surface can render a write-only input without ever
* receiving the secret itself.
* @module @deepseek-ai/dsh-settings/redact
*/
/** Whether a value is a plain data object the walker may recurse into. */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function walk(node, value, path, secrets) {
	if (node === void 0) return value;
	if (node.meta?.role === "secret") {
		secrets.push({
			path,
			set: value !== void 0
		});
		return;
	}
	switch (node.type) {
		case "object": {
			const properties = node.dict ?? {};
			const source = isRecord(value) ? value : void 0;
			const rebuilt = {};
			if (source !== void 0) for (const [key, entry] of Object.entries(source)) {
				if (key in properties) continue;
				rebuilt[key] = entry;
			}
			for (const [key, child] of Object.entries(properties)) {
				const stripped = walk(child, source?.[key], [...path, key], secrets);
				if (stripped !== void 0) rebuilt[key] = stripped;
			}
			return source === void 0 && Object.keys(rebuilt).length === 0 ? value : rebuilt;
		}
		case "dict": {
			if (!isRecord(value)) return value;
			const rebuilt = {};
			for (const [key, entry] of Object.entries(value)) {
				const stripped = walk(node.inner, entry, [...path, key], secrets);
				if (stripped !== void 0) rebuilt[key] = stripped;
			}
			return rebuilt;
		}
		case "array":
			if (!Array.isArray(value)) return value;
			return value.map((entry, index) => walk(node.inner, entry, [...path, String(index)], secrets));
		default: return value;
	}
}
/**
* Remove every `role('secret')` field a schema declares from a value. The
* walker follows `object`, `dict`, and `array` containers; a secret must be
* declared directly on a field reachable through those containers (a secret
* buried inside a union branch or transform is not reachable and must not be
* modeled that way). The input is never mutated.
* @param schema - live schemastery schema describing the value.
* @param value - the value to strip; `undefined` yields an empty record with
*   object-property secret slots still enumerated.
* @returns the stripped detached value and the ordered secret positions.
*/
function redactSecrets(schema, value) {
	const secrets = [];
	return {
		value: walk(schema, value, [], secrets),
		secrets
	};
}
/**
* Service Definition for the user-settings capability seam (`ctx.settings`). Providers store one raw document of
* per-namespace sections; plugins register a namespace schema and read the
* resolved value, which layers schema defaults, the registrant's composition
* `base`, and the user document section, in that order.
* @module @deepseek-ai/dsh-settings
*/
const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
/**
* Brand a raw string as a {@link SettingsNamespace}.
* @param value - candidate namespace; lowercase kebab-case, as in plugin short names.
* @returns the branded namespace.
*/
function settingsNamespace(value) {
	if (!NAMESPACE_PATTERN.test(value)) throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
	return value;
}
/**
* Deep equality over JSON-compatible data (objects, arrays, primitives) — the
* Service Definition's single change-detection predicate, exported so the invariant
* companion checks exactly the implementation's relation.
* @param a - one JSON-compatible value.
* @param b - the other JSON-compatible value.
* @returns whether the two values are structurally equal.
*/
function deepEqualJson(a, b) {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((entry, index) => deepEqualJson(entry, b[index]));
	}
	const left = a;
	const right = b;
	const keys = Object.keys(left);
	if (keys.length !== Object.keys(right).length) return false;
	return keys.every((key) => key in right && deepEqualJson(left[key], right[key]));
}
/**
* A write refused because the namespace moved since the caller read it. The
* Service Definition's serialized write queue orders writes; it cannot tell a fresh writer
* from one holding a stale snapshot, which is what this reports.
*/
var SettingsConflictError = class extends Error {
	/** Stable machine code for wire layers mapping this to their own taxonomy. */
	code = "SETTINGS_CONFLICT";
	/** The revision the write expected. */
	expected;
	/** The revision the namespace actually stands at. */
	actual;
	/**
	* @param ns - the namespace whose write was refused.
	* @param expected - the revision the caller sent.
	* @param actual - the revision now stored.
	*/
	constructor(ns, expected, actual) {
		super(`settings namespace "${ns}" changed since it was read (expected revision ${String(expected)}, now ${String(actual)})`);
		this.name = "SettingsConflictError";
		this.expected = expected;
		this.actual = actual;
	}
};
/** Whether a value is a plain data object (not an array, null, or class instance). */
function isPlainObject(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
/** Apply one path op to a detached section, returning the next section. */
function applyPathOp(section, op) {
	const [head, ...rest] = op.path;
	if (head === void 0) {
		if (op.op === "unset") return {};
		if (!isPlainObject(op.value)) throw new TypeError("settings mutate: setting the section root requires a plain object");
		return { ...op.value };
	}
	if (rest.length === 0) {
		if (op.op === "set") return {
			...section,
			[head]: op.value
		};
		const { [head]: _removed,...kept } = section;
		return kept;
	}
	const child = section[head];
	if (!isPlainObject(child)) {
		if (op.op === "unset") return section;
		return {
			...section,
			[head]: applyPathOp({}, {
				...op,
				path: rest
			})
		};
	}
	return {
		...section,
		[head]: applyPathOp(child, {
			...op,
			path: rest
		})
	};
}
/** Human label for a value that lossless JSON cannot represent (numbers reject inline). */
function describeRejected(value) {
	if (value === void 0) return "undefined";
	if (typeof value === "object" && value !== null) {
		const name$1 = Object.getPrototypeOf(value)?.constructor?.name;
		return name$1 === void 0 || name$1 === "Object" ? "a non-plain object" : `a ${name$1}`;
	}
	return `a ${typeof value}`;
}
/**
* Detach and validate one write input in a single walk before persistence:
* only JSON data (plain objects, arrays, strings, finite numbers,
* booleans, `null`) may reach a provider document. `structuredClone` alone
* would admit Dates, Maps, BigInts, and cycles that YAML/JSON storage then
* silently distorts on the reload round-trip. `undefined` entries in objects
* are skipped — the same sparse-patch semantics as {@link mergeLayers} — while
* an `undefined` array entry is rejected rather than coerced.
* @param root - plain-object write input (caller-checked).
* @param reject - builds the validation error from a value label and its `$`-rooted path.
* @returns the detached JSON-compatible clone.
*/
function cloneJsonShaped(root, reject) {
	const visiting = /* @__PURE__ */ new WeakSet();
	const clone = (value, path) => {
		if (value === null || typeof value === "string" || typeof value === "boolean") return value;
		if (typeof value === "number") {
			if (!Number.isFinite(value)) throw reject("a non-finite number", path);
			return value;
		}
		if (Array.isArray(value)) {
			if (visiting.has(value)) throw reject("a circular reference", path);
			visiting.add(value);
			const entries = value.map((entry, index) => clone(entry, `${path}[${index}]`));
			visiting.delete(value);
			return entries;
		}
		if (isPlainObject(value)) {
			if (visiting.has(value)) throw reject("a circular reference", path);
			visiting.add(value);
			const out = {};
			for (const [key, entry] of Object.entries(value)) {
				if (entry === void 0) continue;
				out[key] = clone(entry, `${path}.${key}`);
			}
			visiting.delete(value);
			return out;
		}
		throw reject(describeRejected(value), path);
	};
	return clone(root, "$");
}
/**
* Layer `over` onto `under`: plain objects merge recursively, every other
* value (arrays included) replaces the lower layer wholesale. `over` never
* carries `undefined` entries — sections come from parsed documents and write
* snapshots pass {@link cloneJsonShaped}, which strips them so a sparse patch
* cannot erase lower keys.
*/
function mergeLayers(under, over) {
	if (over === void 0) return under;
	if (!isPlainObject(under) || !isPlainObject(over)) return over;
	const merged = { ...under };
	for (const [key, value] of Object.entries(over)) merged[key] = key in merged ? mergeLayers(merged[key], value) : value;
	return merged;
}
/** Recursively freeze one resolved value so handed-out snapshots stay immutable. */
function deepFreeze(value) {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
	for (const entry of Object.values(value)) deepFreeze(entry);
	return Object.freeze(value);
}
/**
* Abstract settings service. Providers implement raw-document storage
* (`load`/`persist`) and push external changes through {@link Settings.publish};
* the base class owns namespace registration, resolution, validation, change
* detection, and the `settings/updated` commit event.
*/
var SettingsProvider = class extends Service {
	registrations = /* @__PURE__ */ new Map();
	/** Latest published raw document; empty until the provider's first publish. */
	document = {};
	/** Per-namespace write chains; settled tails, so a failure never poisons the queue. */
	writeQueues = /* @__PURE__ */ new Map();
	/** In-flight watcher invocation segments, drained by the dispose teardown. */
	pendingTails = /* @__PURE__ */ new Set();
	/** Set at service dispose: refuse new writes while queued ones drain. */
	stopped = false;
	/** Opaque read of {@link stopped}: control flow cannot narrow it across awaits. */
	isStopped() {
		return this.stopped;
	}
	constructor(ctx) {
		super(ctx, "settings");
	}
	/**
	* Load the provider's document once and publish it before the service
	* becomes injectable, and register the write-drain teardown. Providers with
	* their own init (watchers, connections) delegate here first via
	* `yield* super[Service.init]()`; their disposers then run before the drain.
	*/
	async *[Service.init]() {
		yield async () => {
			this.stopped = true;
			await Promise.allSettled([...this.writeQueues.values(), ...this.pendingTails]);
		};
		this.publish(await this.load());
	}
	/**
	* Absolute path of the provider's user-editable document, when its storage
	* is one local file. Configuration surfaces use this only as availability
	* metadata; the guarded open operation resolves the path again Host-side.
	* Non-file providers leave it undefined and expose no open-document affordance.
	* @returns the absolute local document path, or undefined for non-file storage.
	*/
	get documentPath() {}
	/**
	* Prepare the provider's user-editable document for a native editor. File
	* providers may materialize an absent document before returning its path;
	* non-file providers return undefined.
	* @returns the absolute local document path, or undefined for non-file storage.
	*/
	prepareDocument() {
		return Promise.resolve(this.documentPath);
	}
	/**
	* Register a namespace schema and receive its owner scope. The registration
	* is an effect on the calling plugin's fiber: disposing that fiber removes
	* the namespace and its observers. An invalid stored section fails the
	* registration itself — the earliest point where the schema can judge it.
	* @param ns - unique namespace; duplicate registration fails loud.
	* @param schema - schemastery schema resolving this namespace's value.
	* @param options - composition `base` layer and effect timing.
	* @returns the owner scope for reads, observation, and updates.
	*/
	register(ns, schema, options) {
		if (this.registrations.has(ns)) throw new Error(`settings namespace "${ns}" is already registered`);
		const registration = {
			ns,
			schema,
			base: options?.base,
			applies: options?.applies ?? "live",
			...options?.validate === void 0 ? {} : { validate: options.validate },
			resolved: deepFreeze(this.resolve(schema, options?.base, this.section(ns), options?.validate)),
			revision: 0,
			watchers: /* @__PURE__ */ new Set()
		};
		this.ctx.effect(() => {
			this.registrations.set(ns, registration);
			return () => this.registrations.delete(ns);
		}, `settings.register(${JSON.stringify(String(ns))})`);
		return {
			get: () => registration.resolved,
			watch: (callback) => {
				const watcher = {
					callback,
					tail: Promise.resolve(),
					active: true
				};
				registration.watchers.add(watcher);
				return () => {
					watcher.active = false;
					registration.watchers.delete(watcher);
				};
			},
			update: (patch) => this.update(ns, patch),
			replace: (section) => this.replace(ns, section)
		};
	}
	/**
	* Describe every registered namespace for configuration surfaces, including
	* the composition `base` and raw user layers so a form can mark which fields
	* the user overrode (presence in `user`) and what a reset returns to.
	* @param options - redaction switch; wire surfaces must redact.
	* @returns one descriptor per registered namespace, in registration order.
	*/
	describe(options) {
		return [...this.registrations.values()].map((registration) => {
			let user;
			try {
				user = this.section(registration.ns);
			} catch {
				user = void 0;
			}
			const base = registration.base === void 0 ? void 0 : structuredClone(registration.base);
			const detachedUser = user === void 0 ? void 0 : structuredClone(user);
			const descriptor = {
				ns: registration.ns,
				schema: registration.schema.toJSON(),
				value: registration.resolved,
				revision: registration.revision,
				...base === void 0 ? {} : { base },
				...detachedUser === void 0 ? {} : { user: detachedUser },
				applies: registration.applies
			};
			if (options?.redactSecrets !== true) return descriptor;
			const schema = registration.schema;
			const redacted = redactSecrets(schema, registration.resolved);
			return {
				...descriptor,
				value: redacted.value,
				...base === void 0 ? {} : { base: redactSecrets(schema, base).value },
				...detachedUser === void 0 ? {} : { user: redactSecrets(schema, detachedUser).value },
				secrets: redacted.secrets
			};
		});
	}
	/**
	* Read one registered namespace's resolved value.
	* @param ns - the namespace to read.
	* @returns the resolved value, or `undefined` while unregistered.
	*/
	get(ns) {
		return this.registrations.get(ns)?.resolved;
	}
	/**
	* Merge a patch into one registered namespace's user layer, validate the
	* resolved candidate, persist through the provider, then commit and emit.
	* A validation failure rejects before anything is persisted. Writes to one
	* namespace are serialized: concurrent updates apply in call order, each
	* merging over the previous write's committed section.
	* @param ns - the registered namespace to update.
	* @param patch - plain-object patch over the user section.
	* @param expectedRevision - the descriptor `revision` the caller read; a
	*   namespace that moved past it rejects with {@link SettingsConflictError}.
	*/
	async update(ns, patch, expectedRevision) {
		return this.write(ns, patch, "merge", expectedRevision);
	}
	/**
	* Replace one registered namespace's user section wholesale, validate,
	* persist, then commit and emit. Keys absent from `section` fall back to the
	* composition `base` and schema defaults — this is the removal/reset path a
	* merge-only patch cannot express (`replace({})` re-inherits everything).
	* @param ns - the registered namespace to replace.
	* @param section - the complete next user section.
	* @param expectedRevision - the descriptor `revision` the caller read; a
	*   namespace that moved past it rejects with {@link SettingsConflictError}.
	*/
	async replace(ns, section, expectedRevision) {
		return this.write(ns, section, "replace", expectedRevision);
	}
	/**
	* Apply path-addressed edits to one registered namespace's user section,
	* validate, persist, then commit and emit. The ops are applied to the
	* section as it stands when the write reaches the front of the queue, so a
	* caller never has to restate fields it did not touch — and, crucially,
	* cannot delete fields it never saw. This is the write path for any caller
	* holding a redacted view; `replace` remains the wholesale reset.
	* @param ns - the registered namespace to edit.
	* @param ops - ordered path edits; later ops observe earlier ones.
	* @param expectedRevision - the descriptor `revision` the caller read; a
	*   namespace that moved past it rejects with {@link SettingsConflictError}.
	*/
	async mutate(ns, ops, expectedRevision) {
		if (!Array.isArray(ops)) throw new TypeError(`settings mutate for "${ns}" must be an array of path ops`);
		for (const op of ops) {
			if (!isPlainObject(op) || op["op"] !== "set" && op["op"] !== "unset") throw new TypeError(`settings mutate for "${ns}" ops must be {op:'set'|'unset', path}`);
			if (!Array.isArray(op["path"]) || op["path"].some((part) => typeof part !== "string")) throw new TypeError(`settings mutate for "${ns}" op paths must be arrays of strings`);
		}
		return this.write(ns, ops, "mutate", expectedRevision);
	}
	/** Validate a write, then queue it on the namespace's serialized write chain. */
	write(ns, input, mode, expectedRevision) {
		const verb = mode === "merge" ? "update" : mode === "replace" ? "replace" : "mutate";
		const registration = this.registrations.get(ns);
		if (registration === void 0) throw new Error(`settings namespace "${ns}" is not registered`);
		if (this.isStopped()) throw new Error(`settings service is disposed: "${ns}" cannot be written`);
		if (!this.writable) throw new Error(`settings provider is read-only: "${ns}" cannot be updated in-process`);
		let payload;
		if (mode === "mutate") payload = { ops: input };
		else {
			if (!isPlainObject(input)) throw new TypeError(`settings ${verb} for "${ns}" must be a plain object`);
			payload = input;
		}
		const snapshot = cloneJsonShaped(payload, (label, path) => /* @__PURE__ */ new TypeError(`settings ${verb} for "${ns}" must contain only JSON-compatible data (found ${label} at ${path})`));
		const run = (this.writeQueues.get(ns) ?? Promise.resolve()).catch(() => void 0).then(async () => {
			if (this.isStopped()) throw new Error(`settings service was disposed before the queued "${ns}" ${verb} ran`);
			if (this.registrations.get(ns) !== registration) throw new Error(`settings namespace "${ns}" registration was disposed before the queued ${verb} ran`);
			const current = this.section(ns) ?? {};
			if (expectedRevision !== void 0 && expectedRevision !== registration.revision) throw new SettingsConflictError(ns, expectedRevision, registration.revision);
			const section = mode === "merge" ? mergeLayers(current, snapshot) : mode === "replace" ? snapshot : snapshot["ops"].reduce(applyPathOp, current);
			const next = deepFreeze(this.resolve(registration.schema, registration.base, section, registration.validate));
			await this.persist(ns, section);
			this.document[ns] = section;
			if (this.registrations.get(ns) === registration && !this.isStopped()) {
				this.bumpRevision(registration, current, section);
				this.commit(registration, next, "update");
			}
		});
		this.writeQueues.set(ns, run);
		return run;
	}
	/**
	* Provider hook: commit a complete raw document observed in storage. Each
	* registered namespace re-resolves; an invalid section keeps that
	* namespace's last good value and warns, other namespaces still commit.
	* @param doc - the detached raw document (unregistered sections preserved).
	* @param source - change origin; defaults to `provider`.
	*/
	publish(doc, source = "provider") {
		const before = /* @__PURE__ */ new Map();
		for (const registration of this.registrations.values()) try {
			before.set(registration.ns, this.section(registration.ns));
		} catch {
			before.set(registration.ns, void 0);
		}
		this.document = doc;
		for (const registration of this.registrations.values()) {
			let next;
			try {
				next = deepFreeze(this.resolve(registration.schema, registration.base, this.section(registration.ns), registration.validate));
			} catch (error) {
				this.ctx.logger.warn("settings: keeping last good \"%s\" after invalid stored section", registration.ns);
				this.ctx.logger.warn(error);
				continue;
			}
			this.bumpRevision(registration, before.get(registration.ns), this.section(registration.ns));
			this.commit(registration, next, source);
		}
	}
	/** Read one namespace's raw user section, rejecting non-object sections. */
	section(ns) {
		const section = this.document[ns];
		if (section === void 0) return void 0;
		if (!isPlainObject(section)) throw new TypeError(`settings section "${ns}" must be an object of keys`);
		return section;
	}
	/** Resolve one namespace value: schema defaults, then `base`, then the user layer. */
	resolve(schema, base, section, validate) {
		const value = schema(mergeLayers(base, section));
		validate?.(value);
		return value;
	}
	/**
	* Advance a namespace's revision when its RAW section changed, and announce
	* it. Deliberately independent of {@link commit}'s resolved-value equality:
	* storing an override equal to the composition base leaves the resolved
	* value alone but changes what the document says, which is exactly what a
	* configuration surface must re-read.
	*/
	bumpRevision(registration, before, after) {
		if (deepEqualJson(before, after)) return;
		registration.revision += 1;
		this.emitDocumentUpdated(registration.ns, registration.revision);
	}
	/** Contained fan-out of `settings/document-updated`, mirroring {@link commit}'s. */
	emitDocumentUpdated(ns, revision) {
		let invariantFailure;
		const args = [
			"settings/document-updated",
			ns,
			revision
		];
		for (const listener of this.ctx.events.dispatch("emit", args)) try {
			const returned = listener(ns, revision);
			if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
				this.warnListenerFailure(ns, error);
			});
		} catch (error) {
			if (error?.code === "INVARIANT") {
				invariantFailure ??= error;
				continue;
			}
			this.warnListenerFailure(ns, error);
		}
		if (invariantFailure !== void 0) throw invariantFailure;
	}
	/** Commit a resolved value when changed: swap, notify watchers, emit the event. */
	commit(registration, next, source) {
		const prev = registration.resolved;
		if (deepEqualJson(next, prev)) return;
		registration.resolved = next;
		for (const watcher of [...registration.watchers]) {
			const segment = watcher.tail.then(() => {
				if (!watcher.active || this.isStopped()) return;
				return watcher.callback(next, prev);
			}).then(() => void 0, (error) => {
				this.warnWatcherFailure(registration.ns, error);
			});
			watcher.tail = segment;
			this.pendingTails.add(segment);
			segment.then(() => this.pendingTails.delete(segment));
		}
		let invariantFailure;
		const args = [
			"settings/updated",
			registration.ns,
			next,
			prev,
			source
		];
		for (const listener of this.ctx.events.dispatch("emit", args)) try {
			const returned = listener(registration.ns, next, prev, source);
			if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
				this.warnListenerFailure(registration.ns, error);
			});
		} catch (error) {
			if (error?.code === "INVARIANT") {
				invariantFailure ??= error;
				continue;
			}
			this.warnListenerFailure(registration.ns, error);
		}
		if (invariantFailure !== void 0) throw invariantFailure;
	}
	/** Contained-watcher diagnostic shared by the sync and async failure paths. */
	warnWatcherFailure(ns, error) {
		this.ctx.logger.warn("settings: watcher for \"%s\" failed", ns);
		this.ctx.logger.warn(error);
	}
	/** Contained-listener diagnostic shared by the sync and async failure paths. */
	warnListenerFailure(ns, error) {
		this.ctx.logger.warn("settings: a settings/updated listener for \"%s\" failed", ns);
		this.ctx.logger.warn(error);
	}
};

//#endregion
//#region src/ip-pool-settings/namespace.ts
/** Namespace owned by this plugin (kebab-case per brand rules). */
const IP_POOL_NAMESPACE = settingsNamespace("ip-pool");
/** docs/ip-pool.md §4.6 probe defaults (S3 first entry is the doc-mandated default). */
const DEFAULT_PROBE_MODEL = "big-pickle";
const IpPoolConfigSchema = Schema.object({
	enabled: Schema.boolean().default(false),
	probeModels: Schema.array(Schema.string()).default([]),
	maxConcurrentProbes: Schema.number().min(1).max(8).step(1).default(3),
	free: Schema.object({
		enabled: Schema.boolean().default(true),
		targetSize: Schema.number().min(1).max(100).step(1).default(20),
		blockedCountries: Schema.array(Schema.string()).default(["CN"])
	}),
	manual: Schema.array(Schema.string()).default([]),
	subscription: Schema.object({
		urls: Schema.array(Schema.string()).default([]),
		refreshMs: Schema.number().min(6e4).max(1440 * 6e4).step(1).default(30 * 6e4)
	}),
	singbox: Schema.object({ path: Schema.string().default("sing-box") }),
	pinnedExitId: Schema.string().default(""),
	pinnedStrict: Schema.boolean().default(false),
	proxyHosts: Schema.array(Schema.string()).default([]),
	maxRotateAttempts: Schema.number().min(0).max(10).step(1).default(3)
});
/** Resolve the schema-level default for the probe model set (§4.6). */
function resolveProbeModels(configured) {
	if (configured.length > 0) return [...new Set(configured)];
	return [DEFAULT_PROBE_MODEL];
}
/** Map one resolved settings value onto the plugin config shape (config.ts). */
function toIpPoolConfig(value) {
	return {
		enabled: value.enabled,
		manual: value.manual,
		pinnedExitId: value.pinnedExitId,
		pinnedStrict: value.pinnedStrict,
		proxyHosts: value.proxyHosts,
		free: {
			enabled: value.free.enabled,
			targetSize: value.free.targetSize,
			blockedCountries: value.free.blockedCountries
		},
		subscriptions: value.subscription.urls,
		singbox: { path: value.singbox.path },
		probeModels: resolveProbeModels(value.probeModels),
		maxRotateAttempts: value.maxRotateAttempts
	};
}

//#endregion
//#region src/ip-pool-settings/bridge.ts
/** Bridge route prefix (same-origin, loopback-only). */
const IP_POOL_BRIDGE_PREFIX = "/api/opencode2dsh/ip-pool";
/** Cap on JSON request bodies (a probe trigger is tiny). */
const MAX_JSON_BODY_BYTES = 16 * 1024;
/** Build the /status view over the live runtime (or a disabled stub). */
function buildStatusView(runtime, pinnedStrict, proxyHosts) {
	const snapshot = runtime ? runtime.pool.snapshot() : {
		state: "healthy",
		total: 0,
		bySource: {
			free: 0,
			manual: 0,
			subscription: 0,
			goproxy: 0
		},
		availableFree: 0,
		pinned: ""
	};
	const now = Date.now();
	const exits = runtime ? runtime.pool.list().map((entry) => ({
		id: entry.id,
		source: entry.source,
		protocol: entry.protocol,
		pinned: entry.pinned,
		exitIP: entry.exitIP,
		exitLocation: entry.exitLocation,
		latencyMs: entry.latencyMs,
		quality: entry.quality,
		state: entry.health.state,
		cooling: entry.health.cooldownUntil > now,
		cooldownUntil: entry.health.cooldownUntil,
		consecutiveLimited: entry.health.consecutiveLimited,
		bannedModels: entry.bans.filter((b) => b.ban.state !== "ok").map((b) => ({
			model: b.model,
			state: b.ban.state,
			bannedAt: b.ban.bannedAt
		})),
		passive: runtime.pool.passiveStats(entry.id)
	})) : [];
	return {
		enabled: runtime !== null && runtime.installer.enabled,
		deferredReason: runtime !== null && !runtime.installer.enabled ? runtime.installer.deferredReason ?? "" : "",
		state: snapshot.state,
		total: snapshot.total,
		bySource: snapshot.bySource,
		availableFree: snapshot.availableFree,
		targetSize: runtime ? runtime.pool.targetSize : 20,
		pinned: snapshot.pinned !== "" ? {
			id: snapshot.pinned,
			strict: pinnedStrict
		} : null,
		proxyHosts,
		exits,
		prober: runtime ? runtime.prober.stats : {
			queued: 0,
			inFlight: 0,
			enqueued: 0,
			completed: 0
		},
		refill: runtime?.refill ? {
			...runtime.refill.lastRound,
			progress: runtime.refill.progress
		} : null,
		subscription: runtime?.subscriptions ? {
			urlCount: runtime.subscriptions.urlCount,
			pendingConversion: runtime.subscriptions.state.pendingConversion.length,
			convertedAdmitted: runtime.subscriptions.state.convertedAdmitted,
			plaintextAdmitted: runtime.subscriptions.state.plaintextAdmitted,
			lastFetch: runtime.subscriptions.state.lastFetch,
			lastError: runtime.subscriptions.state.lastError
		} : null,
		at: now
	};
}
/** Whether a socket address is a literal loopback peer. */
function isLoopbackAddress(address) {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
/** Whether a normalized hostname is a literal loopback authority. */
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Parse one bare Host authority; undefined for anything non-canonical. */
function parseAuthority(authority) {
	if (authority.trim() !== authority) return void 0;
	const match = authority.startsWith("[") ? /^\[[^\]]+\](?::([0-9]+))?$/.exec(authority) : /^[^:@/?#\s]+(?::([0-9]+))?$/.exec(authority);
	if (match === null) return void 0;
	try {
		const url = new URL("http://" + authority);
		if (url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") return void 0;
		const rawPort = match[1];
		if (rawPort !== void 0 && (String(Number(rawPort)) !== rawPort || Number(rawPort) > 65535)) return void 0;
		return { url };
	} catch {
		return;
	}
}
/** Browser same-origin marker (loopback hosts are always same-origin here). */
function isSameOriginRequest(request, hostUrl) {
	const headers = request.headers;
	if (headers["sec-fetch-site"] === "cross-site") return false;
	const origin = headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(String(origin)).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** Hot-path trust decision: loopback socket + canonical Host + same-origin. */
function isTrustedBridgeRequest(request) {
	if (!isLoopbackAddress(request.socket?.remoteAddress)) return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	const parsed = parseAuthority(host);
	if (parsed === void 0 || parsed.url.host.toLowerCase() !== host.toLowerCase()) return false;
	if (!isSameOriginRequest(request, parsed.url)) return false;
	return isLoopbackHostname(parsed.url.hostname);
}
/** One JSON response. */
function writeJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(JSON.stringify(body));
}
/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_JSON_BODY_BYTES) return void 0;
		chunks.push(Buffer.from(chunk));
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return;
	}
}
/** Build the bridge handlers over the runtime + current settings. */
function makeBridgeHandlers(runtime, settings, deps = {}) {
	return {
		async status() {
			return {
				ok: true,
				value: buildStatusView(runtime(), settings().pinnedStrict, settings().proxyHosts)
			};
		},
		async probe(body) {
			const rt = runtime();
			if (rt === null) return {
				ok: false,
				code: "pool-disabled",
				message: "ip pool is not running (enabled off)"
			};
			const scope = body.scope;
			if (scope === "all") return {
				ok: true,
				value: { queued: await rt.probeAll() }
			};
			if (scope === "refill") {
				await rt.refillNow();
				return {
					ok: true,
					value: { refilled: true }
				};
			}
			if (scope === "exit") {
				const exitId = typeof body.exitId === "string" ? body.exitId : "";
				if (!rt.pool.has(exitId)) return {
					ok: false,
					code: "unknown-exit",
					message: `exit "${exitId}" is not in the pool`
				};
				return {
					ok: true,
					value: { queued: await rt.probeExit(exitId) }
				};
			}
			return {
				ok: false,
				code: "settings-rejected",
				message: "probe scope must be 'all', 'exit' or 'refill'"
			};
		},
		async models() {
			const { staticFreeModels } = await import("./catalog-BoSneA-z.js");
			const rows = staticFreeModels.map((id) => ({
				id,
				verified: true
			}));
			const seen = new Set(staticFreeModels);
			for (const id of deps.listLiveModels?.() ?? []) {
				if (typeof id !== "string" || id === "" || seen.has(id)) continue;
				seen.add(id);
				rows.push({
					id,
					verified: false
				});
			}
			return {
				ok: true,
				value: { models: rows }
			};
		}
	};
}
/** Build the loopback-guarded routes. The route bodies are host-shaped
*  (node:http req/res); typed loosely because the plugin never touches the
*  webServer service itself — index.ts does. */
function makeBridgeRoutes(handlers, deps = {}) {
	const guard = deps.guard ?? isTrustedBridgeRequest;
	const check = (req, res) => {
		if (!guard(req)) {
			writeJson(res, 403, { error: "forbidden" });
			return false;
		}
		if (req.method !== "POST") {
			writeJson(res, 405, { error: "method not allowed: " + (req.method ?? "") });
			return false;
		}
		return true;
	};
	return [
		{
			kind: "exact",
			path: `${IP_POOL_BRIDGE_PREFIX}/status`,
			handler: async (req, res) => {
				if (!check(req, res)) return;
				writeJson(res, 200, await handlers.status());
			}
		},
		{
			kind: "exact",
			path: `${IP_POOL_BRIDGE_PREFIX}/models`,
			handler: async (req, res) => {
				if (!check(req, res)) return;
				writeJson(res, 200, await handlers.models());
			}
		},
		{
			kind: "exact",
			path: `${IP_POOL_BRIDGE_PREFIX}/probe`,
			handler: async (req, res) => {
				if (!check(req, res)) return;
				let body;
				try {
					body = await readJsonBody(req);
				} catch {
					body = void 0;
				}
				if (body === void 0 || typeof body !== "object" || body === null) {
					writeJson(res, 400, {
						ok: false,
						code: "settings-rejected",
						message: "unreadable JSON body"
					});
					return;
				}
				writeJson(res, 200, await handlers.probe(body));
			}
		}
	];
}

//#endregion
//#region src/ip-pool-settings/apply.ts
/** Extract the ip-pool settings value with defaults filled (schema-independent). */
function withDefaults(value) {
	const raw = value ?? {};
	const urls = raw.subscription?.urls ?? raw.subscriptions ?? [];
	return {
		enabled: raw.enabled ?? false,
		probeModels: raw.probeModels ?? [],
		maxConcurrentProbes: raw.maxConcurrentProbes ?? 3,
		free: {
			enabled: raw.free?.enabled ?? true,
			targetSize: raw.free?.targetSize ?? 20,
			blockedCountries: raw.free?.blockedCountries ?? ["CN"]
		},
		manual: raw.manual ?? [],
		subscription: {
			urls,
			refreshMs: raw.subscription?.refreshMs ?? 30 * 6e4
		},
		singbox: { path: raw.singbox?.path ?? "sing-box" },
		pinnedExitId: raw.pinnedExitId ?? "",
		pinnedStrict: raw.pinnedStrict ?? false,
		proxyHosts: raw.proxyHosts ?? [],
		maxRotateAttempts: raw.maxRotateAttempts ?? 3
	};
}
const defaultAssemble = async (config, logger) => {
	const { startIpPool } = await import("./ip-pool-Cfe60Xj4.js");
	return startIpPool(config, logger);
};
/**
* Register the ip-pool namespace, own the live runtime, mount the bridge.
* Returns the controller handle; disposal rides the plugin fiber.
*/
function applyIpPoolSettings(ctx, config, logger, deps = {}) {
	const assemble = deps.assemble ?? defaultAssemble;
	const controller = {
		runtime: null,
		settings: () => withDefaults(config.ipPool),
		asConfig: (value) => ({
			...config,
			ipPool: toIpPoolConfig(value)
		})
	};
	/** Assemble on first enable; reuse across later commits (live reconfigure). */
	const ensureRuntime = async () => {
		if (controller.runtime !== null) return;
		controller.runtime = await assemble(controller.asConfig(controller.settings()), logger);
	};
	const applyCommitted = (value) => {
		config.ipPool = toIpPoolConfig(value);
		const rt = controller.runtime;
		if (value.enabled && rt === null) {
			ensureRuntime().then(() => controller.runtime?.reconfigure(controller.asConfig(value))).catch((err) => {
				logger.warn(`opencode2dsh: ip pool start failed: ${err instanceof Error ? err.message : String(err)}`);
			});
			return;
		}
		if (rt !== null) rt.reconfigure(controller.asConfig(value)).catch((err) => {
			logger.warn(`opencode2dsh: ip pool live re-apply failed: ${err instanceof Error ? err.message : String(err)}`);
		});
	};
	if (typeof ctx.settings?.register !== "function") {
		logger.warn("opencode2dsh: settings seam lacks register; ip-pool settings page disabled (patch config still works)");
		if (controller.settings().enabled) ensureRuntime().catch((err) => {
			logger.warn(`opencode2dsh: ip pool start failed: ${err instanceof Error ? err.message : String(err)}`);
		});
		return controller;
	}
	const scope = ctx.settings.register(IP_POOL_NAMESPACE, IpPoolConfigSchema, {
		base: controller.settings(),
		applies: "live"
	});
	applyCommitted(withDefaults(scope.get()));
	const disposeWatch = scope.watch((next) => {
		applyCommitted(withDefaults(next));
	});
	if (typeof ctx.inject === "function") Promise.resolve(ctx.inject(["webServer"], (bctx) => {
		if (!bctx.webServer) return;
		const handlers = makeBridgeHandlers(() => controller.runtime, () => ({
			pinnedStrict: controller.settings().pinnedStrict,
			proxyHosts: controller.runtime?.installer && controller.settings().proxyHosts.length > 0 ? controller.settings().proxyHosts : ["opencode.ai"]
		}), { listLiveModels: deps.listLiveModels });
		const disposers = [];
		for (const route of makeBridgeRoutes(handlers)) disposers.push(bctx.webServer.register(route));
		logger.info(`opencode2dsh: ip-pool bridge mounted at ${IP_POOL_BRIDGE_PREFIX} (${disposers.length} routes)`);
		const maybeEffect$1 = bctx.effect;
		if (typeof maybeEffect$1 === "function") maybeEffect$1.call(bctx, () => () => {
			for (const dispose of disposers) dispose();
		});
	}));
	logger.info("opencode2dsh: settings namespace \"ip-pool\" registered — live apply via 设置 → 插件 → IP 池");
	const maybeEffect = ctx.effect;
	if (typeof maybeEffect === "function") maybeEffect.call(ctx, () => () => {
		disposeWatch();
		controller.runtime?.dispose();
		controller.runtime = null;
	});
	return controller;
}

//#endregion
//#region src/provider.ts
function providerBaseURL(port) {
	return `http://127.0.0.1:${port}/v1`;
}
/**
* Remove the llm-pi-ai provider route left behind by sidecar mode. Adapter
* mode serves the provider id itself; a stale route pointing at a dead
* sidecar port would shadow dispatch and fail every call with a connection
* error. Returns true when a route was actually removed.
*/
async function removeProviderRoute(seams, providerId) {
	if (typeof seams?.settings?.get !== "function" || typeof seams?.settings?.mutate !== "function") return false;
	const namespace = seams.settings.get("llm-pi-ai");
	if (!namespace?.providers || !(providerId in namespace.providers)) return false;
	await seams.settings.mutate("llm-pi-ai", [{
		op: "unset",
		path: ["providers", providerId]
	}]);
	return true;
}
/** Parse the agent's OpenAI-shaped /v1/models reply into pi-ai model entries. */
function toPiAiModels(data) {
	if (!data || typeof data !== "object") return [];
	const list = data.data;
	if (!Array.isArray(list)) return [];
	const seen = /* @__PURE__ */ new Set();
	const entries = [];
	for (const item of list) {
		if (!item || typeof item !== "object") continue;
		const id = item.id;
		if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
		seen.add(id);
		const name$1 = item.name;
		entries.push({
			id,
			name: typeof name$1 === "string" && name$1.length > 0 ? name$1 : id
		});
	}
	return entries;
}
async function fetchModels(port, token, timeoutMs = 1e4) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(providerBaseURL(port) + "/models", {
			headers: { authorization: `Bearer ${token}` },
			signal: controller.signal
		});
		if (!response.ok) throw new Error(`GET /v1/models failed: HTTP ${response.status}`);
		return toPiAiModels(await response.json());
	} finally {
		clearTimeout(timer);
	}
}
/** GET /healthz (no auth); throws on transport failure or non-2xx. */
async function fetchHealth(port, timeoutMs = 3e3) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: controller.signal });
		if (!response.ok) throw new Error(`GET /healthz failed: HTTP ${response.status}`);
		return await response.json();
	} finally {
		clearTimeout(timer);
	}
}
/**
* Ensure the credential and the llm-pi-ai provider route reflect the running
* agent. Safe to call repeatedly (every refresh): writes are no-ops when the
* stored shape already matches, and mutate keeps other namespaces/routes
* untouched because it edits only the opencode2dsh subtree.
*/
async function registerProvider(seams, target, token, models) {
	await seams.credentials.set(target.apiKeyEnv, token);
	const route = {
		displayName: "opencode2dsh",
		apiKeyEnv: target.apiKeyEnv,
		api: "openai-completions",
		baseURL: providerBaseURL(target.port),
		models
	};
	await seams.settings.mutate("llm-pi-ai", [{
		op: "set",
		path: ["providers", target.providerId],
		value: route
	}]);
	seams.logger.info(`opencode2dsh: registered llm-pi-ai provider "${target.providerId}" with ${models.length} model(s) at ${route.baseURL}`);
}

//#endregion
//#region src/index.ts
const name = "opencode2dsh";
const inject = [
	"llm",
	"credentials",
	"settings"
];
function apply(ctx, config = {}) {
	if (resolveConfig(config).mode === "sidecar") return applySidecar(ctx, config);
	return applyAdapter(ctx, config);
}
/**
* Adapter mode: catalog + LlmAdapter registration. The adapter registration
* is disposed with the plugin fiber (registerAdapter uses ctx.effect
* internally); we only own the catalog refresh loop here.
*/
function applyAdapter(ctx, config) {
	const logger = ctx.logger;
	const cfg = resolveConfig(config);
	const ready = Promise.resolve({
		port: 0,
		version: "adapter"
	});
	if (!ctx.llm || typeof ctx.llm.registerAdapter !== "function") {
		logger.error("opencode2dsh: llm service unavailable; adapter mode cannot register");
		return { ready };
	}
	const dataDir = join(homedir(), ".opencode2dsh");
	const statusPath = join(dataDir, "adapter-status.json");
	const writeStatus = (status, lastError) => {
		writeFile(statusPath, JSON.stringify({
			...status,
			lastError,
			writtenAt: (/* @__PURE__ */ new Date()).toISOString()
		}, null, 2), "utf8").catch(() => {});
	};
	const catalog = new ModelCatalog({
		refreshSeconds: cfg.refreshSeconds,
		cachePath: defaultCachePath(dataDir),
		onRefresh: (status, lastError) => {
			writeStatus(status, lastError);
			if (lastError) logger.warn(`opencode2dsh: catalog refresh issue: ${lastError}`);
		}
	});
	const adapter = new ZenAdapter(catalog);
	applyIpPoolSettings(ctx, config, logger, { listLiveModels: () => catalog.list() });
	ctx.llm.registerAdapter([PROVIDER_ID], adapter);
	logger.info(`opencode2dsh: adapter registered for "${PROVIDER_ID}" (catalog warms up in background)`);
	catalog.start().catch((err) => {
		logger.error(`opencode2dsh: catalog start failed: ${err instanceof Error ? err.message : String(err)}`);
	});
	if (ctx.settings) removeProviderRoute({ settings: ctx.settings }, cfg.providerId).then((removed) => {
		if (removed) logger.info(`opencode2dsh: removed stale sidecar route for "${cfg.providerId}" from llm-pi-ai settings`);
	}).catch((err) => {
		logger.warn(`opencode2dsh: stale route cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
	});
	const maybeEffect = ctx.effect;
	if (typeof maybeEffect === "function") maybeEffect.call(ctx, () => () => {
		catalog.stop();
	});
	return { ready };
}
function applySidecar(ctx, config) {
	const cfg = resolveConfig(config);
	const paths = configPaths(join(homedir(), ".opencode2dsh"));
	const logger = ctx.logger;
	let agent = null;
	let refreshTimer = null;
	let disposed = false;
	let readyResolve = () => {};
	const ready = new Promise((resolve) => {
		readyResolve = resolve;
	});
	const onLog = (line) => {
		logger.info(`[agent] ${line}`);
	};
	/**
	* Wait until the agent's model catalog is no longer "pending" (it fetches
	* the live S1 list a moment after listen; registering before that bakes the
	* 3-model static fallback into the DSH provider until the next refresh).
	*/
	async function waitCatalogReady(port, timeoutMs = 15e3) {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			try {
				const status = (await fetchHealth(port, 2e3))?.models?.status;
				if (status && status !== "pending") return;
			} catch {}
			await new Promise((r) => setTimeout(r, 300));
		}
		logger.warn("opencode2dsh: catalog still pending after timeout; registering whatever the agent exposes now");
	}
	async function refreshModels(info, token, { waitReady = false } = {}) {
		try {
			if (waitReady) await waitCatalogReady(info.port);
			const models = await fetchModels(info.port, token);
			if (ctx.credentials && ctx.settings) await registerProvider({
				credentials: ctx.credentials,
				settings: ctx.settings,
				logger: {
					info: (m) => logger.info(m),
					warn: (m) => logger.warn(m)
				}
			}, {
				providerId: cfg.providerId,
				apiKeyEnv: cfg.apiKeyEnv,
				port: info.port
			}, token, models);
			else logger.warn("opencode2dsh: credentials/settings services unavailable; provider route not registered");
		} catch (err) {
			logger.warn(`opencode2dsh: model refresh failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	function scheduleRefresh(info, token) {
		if (refreshTimer) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			if (disposed) return;
			refreshModels(info, token).then(() => {
				if (!disposed && agent?.getState() === "ready") scheduleRefresh(info, token);
			});
		}, cfg.refreshSeconds * 1e3);
	}
	async function startOnce() {
		const token = await ensureToken(paths);
		await writeAgentConfig(paths, {
			token,
			refreshSeconds: cfg.refreshSeconds
		});
		agent = new AgentProcess(cfg.agentPath ?? defaultAgentPath(), [
			"--config",
			paths.configPath,
			"--print-ready",
			...cfg.agentArgs ?? []
		], {
			restartDelayMs: cfg.restartDelayMs,
			restartMaxDelayMs: cfg.restartMaxDelayMs,
			maxConsecutiveCrashes: cfg.maxConsecutiveCrashes,
			onLog
		});
		agent.on("exit-restart", (delay, crashes) => {
			logger.warn(`opencode2dsh: agent exited unexpectedly; restarting in ${delay}ms (attempt ${crashes})`);
		});
		agent.on("circuit-tripped", (crashes) => {
			logger.error(`opencode2dsh: agent crashed ${crashes} times consecutively; giving up`);
		});
		agent.on("state", (state) => {
			if (state === "ready") logger.info("opencode2dsh: agent ready");
		});
		const info = await agent.start();
		readyResolve(info);
		await refreshModels(info, token, { waitReady: true });
		scheduleRefresh(info, token);
		return info;
	}
	startOnce().catch((err) => {
		logger.error(`opencode2dsh: failed to start agent: ${err instanceof Error ? err.message : String(err)}`);
	});
	const maybeEffect = ctx.effect;
	if (typeof maybeEffect === "function") maybeEffect.call(ctx, () => () => {
		teardown();
	});
	async function teardown() {
		disposed = true;
		if (refreshTimer) {
			clearTimeout(refreshTimer);
			refreshTimer = null;
		}
		if (agent) {
			await agent.dispose().catch(() => {});
			agent = null;
		}
	}
	return { ready };
}
/**
* Locate the agent binary (sidecar mode, legacy — the published package does
* not bundle it): explicit config wins; then a sibling `legacy/agent` dev
* build; then a bare name on PATH.
*/
function defaultAgentPath() {
	const bin = "opencode2dsh-agent";
	const exe = process.platform === "win32" ? `${bin}.exe` : bin;
	const here = __dirnameSafe();
	for (const sibling of [join(here, "..", "..", "..", "legacy", "agent", exe), join(here, "..", "..", "legacy", "agent", exe)]) if (existsSync(sibling)) return sibling;
	return exe;
}
function __dirnameSafe() {
	try {
		return fileURLToPath(new URL(".", import.meta.url));
	} catch {
		return ".";
	}
}

//#endregion
export { AgentProcess, apply, configPaths, defaultAgentPath, ensureToken, fetchHealth, fetchModels, inject, name, providerBaseURL, registerProvider, resolveConfig, toPiAiModels, writeAgentConfig };