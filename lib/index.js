import { a as defaultCachePath, d as disguiseHeaders, n as ZEN_BASE_URL, t as ModelCatalog, u as deriveRequestIDs } from "./catalog-DSnxhHpA.js";
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
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
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
			const { staticFreeModels } = await import("./catalog-Bq4xQyYD.js");
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
	const { startIpPool } = await import("./ip-pool-XDCQB55U.js");
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