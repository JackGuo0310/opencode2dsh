import { d as disguiseHeaders, f as opencodeUserAgent, l as canonicalSessionID, m as stableID, n as ZEN_BASE_URL, p as randomID } from "./catalog-49XGwVXh.js";
import { r as freeLaneGateTool, t as FREE_LANE_GATE_TOOL_NAMES } from "./messages-PSa7_wRp.js";

//#region src/pool/pool.ts
/** Quality grade from admission latency (GoProxy thresholds). */
function gradeOf(latencyMs) {
	if (latencyMs <= 500) return "S";
	if (latencyMs <= 1e3) return "A";
	if (latencyMs <= 2e3) return "B";
	return "C";
}
const banKey = (exitId, model) => `${exitId}\u0000${model}`;
var ExitPool = class {
	#nodes = /* @__PURE__ */ new Map();
	#health = /* @__PURE__ */ new Map();
	#bans = /* @__PURE__ */ new Map();
	#sessionExit = /* @__PURE__ */ new Map();
	/** Passive-signal counters per exit (docs/ip-pool.md §4.3 被动 + IP-6 stats). */
	#passive = /* @__PURE__ */ new Map();
	#targetSize;
	#cooldownBase;
	#cooldownMax;
	#banConfirmations;
	#deadEvictions;
	#now;
	constructor(options = {}) {
		this.#targetSize = options.targetSize ?? 20;
		this.#cooldownBase = options.limitedCooldownBaseMs ?? 6e4;
		this.#cooldownMax = options.limitedCooldownMaxMs ?? 30 * 6e4;
		this.#banConfirmations = options.modelBanConfirmations ?? 2;
		this.#deadEvictions = options.deadEvictions ?? 2;
		this.#now = options.now ?? Date.now;
	}
	/** Live re-apply of the free-pool target capacity (settings page, §5.1). */
	setTargetSize(value) {
		this.#targetSize = Math.max(1, value);
	}
	/** The effective target capacity (diagnostics / status bridge). */
	get targetSize() {
		return this.#targetSize;
	}
	/** Upsert a node (admission wrote its details); returns false on duplicate
	*  exit IP for a different address — two addresses sharing one exit IP are
	*  one quota bucket and must not both live in the pool (3.1). */
	add(node) {
		if (node.exitIP !== "" && this.#hasExitIP(node.exitIP, node.id)) return false;
		this.#nodes.set(node.id, node);
		if (!this.#health.has(node.id)) this.#health.set(node.id, {
			state: "unknown",
			lastProbedAt: 0,
			consecutiveLimited: 0,
			cooldownUntil: 0,
			inflight: false,
			deadStrikes: 0
		});
		return true;
	}
	#hasExitIP(exitIP, exceptId) {
		for (const node of this.#nodes.values()) if (node.id !== exceptId && node.exitIP === exitIP) return true;
		return false;
	}
	has(id) {
		return this.#nodes.has(id);
	}
	get(id) {
		return this.#nodes.get(id);
	}
	/** Drop a node entirely (dead eviction for free nodes, cleanup otherwise). */
	remove(id) {
		this.#nodes.delete(id);
		this.#health.delete(id);
		this.#passive.delete(id);
		for (const key of this.#bans.keys()) if (key.startsWith(`${id}\u0000`)) this.#bans.delete(key);
		for (const [session, exitId] of this.#sessionExit) if (exitId === id) this.#sessionExit.delete(session);
		this.#clearPinnedIf(id);
	}
	/** Disable without dropping (dead manual/subscription/goproxy nodes, 3.5). */
	markDead(id) {
		const health = this.#health.get(id);
		if (!health) return;
		health.state = "dead";
		health.inflight = false;
	}
	#clearPinnedIf(id) {
		if (this.pinnedId === id) this.pinnedId = "";
	}
	pinnedId = "";
	/** Pin a node (docs/ip-pool.md 3.6); unpinning any previous pinned node. */
	pin(id) {
		if (!this.#nodes.has(id)) return false;
		this.pinnedId = id;
		return true;
	}
	unpin() {
		this.pinnedId = "";
	}
	/** Try to take the exit's serial-probe slot; false when already taken. */
	takeProbeLock(id) {
		const health = this.#health.get(id);
		if (!health || health.inflight) return false;
		health.inflight = true;
		return true;
	}
	releaseProbeLock(id) {
		const health = this.#health.get(id);
		if (health) health.inflight = false;
	}
	markOk(id, model) {
		const health = this.#health.get(id);
		if (health) {
			health.state = "ok";
			health.lastProbedAt = this.#now();
			health.consecutiveLimited = 0;
			health.cooldownUntil = 0;
			health.deadStrikes = 0;
		}
		if (model !== void 0) this.#bans.set(banKey(id, model), {
			state: "ok",
			bannedAt: 0,
			consecutiveFailures: 0
		});
	}
	/** 429: exit-level cooldown with exponential backoff (3.2 / 4.6). */
	markLimited(id) {
		const health = this.#health.get(id);
		if (!health) return 0;
		health.consecutiveLimited += 1;
		health.state = "ok";
		const backoff = Math.min(this.#cooldownBase * 2 ** (health.consecutiveLimited - 1), this.#cooldownMax);
		health.cooldownUntil = this.#now() + backoff;
		return health.cooldownUntil;
	}
	/** Deterministic refusal (upstream RegionError: region blocks are a
	*  property of the exit, not transient noise) — ban the pairing at once. */
	markModelBanned(id, model) {
		this.#bans.set(banKey(id, model), {
			state: "banned",
			bannedAt: this.#now(),
			consecutiveFailures: this.#banConfirmations
		});
	}
	/** 401/403: model-level suspicion; banned after N consecutive (3.2). */
	markModelSignal(id, model) {
		const key = banKey(id, model);
		const current = this.#bans.get(key) ?? {
			state: "ok",
			bannedAt: 0,
			consecutiveFailures: 0
		};
		current.consecutiveFailures += 1;
		if (current.consecutiveFailures >= this.#banConfirmations && current.state !== "banned") {
			current.state = "banned";
			current.bannedAt = this.#now();
		} else if (current.state !== "banned") current.state = "suspect";
		this.#bans.set(key, current);
		return current.state;
	}
	/** Transport failure / 5xx / probe timeout: dead, with free-source eviction
	*  after repeated strikes (3.5). Returns true when the node was evicted. */
	markDeadStrike(id) {
		const node = this.#nodes.get(id);
		const health = this.#health.get(id);
		if (!node || !health) return false;
		health.state = "dead";
		health.inflight = false;
		health.deadStrikes += 1;
		if (node.source === "free" && health.deadStrikes >= this.#deadEvictions) {
			this.remove(id);
			return true;
		}
		return false;
	}
	/** Death from a mid-flight stream (no retry path): same strike accounting. */
	markStreamFailure(id, kind, model) {
		if (kind === "429") {
			this.markLimited(id);
			this.#countPassive(id, "limited");
		} else if (model !== void 0) {
			this.markModelSignal(id, model);
			this.#countPassive(id, "refused");
		}
	}
	/**
	* Passive signal from a REAL request outcome (docs/ip-pool.md §4.2 rule
	* table, §4.3 被动 row): one response header read at the routing layer,
	* applied to the two-tier health exactly like a probe would. Returns the
	* classification for diagnostics.
	*/
	recordPassive(id, statusCode, model, regionBlocked = false) {
		if (!this.#nodes.has(id)) return "ok";
		if (statusCode >= 200 && statusCode < 300) {
			this.markOk(id, model);
			this.#countPassive(id, "ok");
			return "ok";
		}
		if (statusCode === 429) {
			this.markLimited(id);
			this.#countPassive(id, "limited");
			return "limited";
		}
		if (statusCode === 401 || statusCode === 403) {
			if (regionBlocked) this.markModelBanned(id, model);
			else this.markModelSignal(id, model);
			this.#countPassive(id, "refused");
			return "refused";
		}
		this.#countPassive(id, "dead");
		return "dead";
	}
	/** Transport-level failure of a real request (connection died mid-flight). */
	recordPassiveTransport(id) {
		if (!this.#nodes.has(id)) return;
		this.markDeadStrike(id);
		this.#countPassive(id, "transport");
	}
	/** Drop the session's sticky exit when its exit degraded (§3.3). */
	rerouteSession(session) {
		this.#sessionExit.delete(session);
	}
	/** The session's current sticky exit, if any (adapter-side 403 bookkeeping:
	*  the dispatcher recorded the refusal against this exit). */
	exitOfSession(session) {
		return this.#sessionExit.get(session) ?? null;
	}
	#countPassive(id, kind) {
		const bucket = this.#passive.get(id) ?? {
			ok: 0,
			limited: 0,
			refused: 0,
			dead: 0,
			transport: 0
		};
		if (kind === "limited") bucket.limited += 1;
		else if (kind === "refused") bucket.refused += 1;
		else if (kind === "dead") bucket.dead += 1;
		else if (kind === "transport") bucket.transport += 1;
		else bucket.ok += 1;
		this.#passive.set(id, bucket);
	}
	/** Passive-signal counters for one exit (status bridge, IP-6). */
	passiveStats(id) {
		return { ...this.#passive.get(id) ?? {
			ok: 0,
			limited: 0,
			refused: 0,
			dead: 0,
			transport: 0
		} };
	}
	isUsable(id, model) {
		const health = this.#health.get(id);
		if (!health || health.state === "dead") return false;
		if (health.cooldownUntil > this.#now()) return false;
		return this.#bans.get(banKey(id, model))?.state !== "banned";
	}
	/**
	* Pick the exit for one upstream request. Pinned wins while usable (3.6);
	* the rotation pool then prefers session stickiness, health, fewer
	* cooldowns and lower latency with a same-tier shuffle. Pure; no IO.
	*/
	pick(session, model) {
		if (this.pinnedId !== "" && this.isUsable(this.pinnedId, model)) return this.pinnedId;
		const last = this.#sessionExit.get(session);
		if (last !== void 0 && this.isUsable(last, model)) return last;
		const usable = [...this.#nodes.keys()].filter((id) => this.isUsable(id, model));
		if (usable.length === 0) return null;
		const health = (id) => this.#health.get(id);
		const node = (id) => this.#nodes.get(id);
		usable.sort((left, right) => {
			const a = health(left);
			const b = health(right);
			const stateRank = (h) => h.state === "ok" ? 0 : 1;
			const byState = stateRank(a) - stateRank(b);
			if (byState !== 0) return byState;
			const byLimited = a.consecutiveLimited - b.consecutiveLimited;
			if (byLimited !== 0) return byLimited;
			const byLatency = node(left).latencyMs - node(right).latencyMs;
			if (byLatency !== 0) return byLatency;
			return Math.random() < .5 ? -1 : 1;
		});
		const chosen = usable[0];
		if (chosen === void 0) return null;
		this.#sessionExit.set(session, chosen);
		return chosen;
	}
	/** Drop the session's sticky exit (cooldown/dead/ban broke it). */
	breakStickySession(session) {
		this.#sessionExit.delete(session);
	}
	/** Usable = not dead, not cooling, and not banned for every probe model —
	*  approximation: nodes banned for all their known models count as
	*  unusable; with no ban data they stay usable (they are only banned for
	*  specific models, which the caller's model already filters). */
	#isAvailable(id) {
		const health = this.#health.get(id);
		if (!health || health.state === "dead") return false;
		if (health.cooldownUntil > this.#now()) return false;
		const nodeModels = /* @__PURE__ */ new Set();
		let allBanned = true;
		let sawBan = false;
		for (const [key, ban] of this.#bans) {
			if (!key.startsWith(`${id}\u0000`)) continue;
			const model = key.slice(id.length + 1);
			nodeModels.add(model);
			if (ban.state !== "banned") allBanned = false;
			else sawBan = true;
		}
		if (sawBan && nodeModels.size > 0 && allBanned) return false;
		return true;
	}
	/** Count usable free-source nodes toward the refill thresholds. */
	availableFreeCount() {
		let count = 0;
		for (const node of this.#nodes.values()) if (node.source === "free" && this.#isAvailable(node.id)) count += 1;
		return count;
	}
	/** Determine the pool state over the free-source pool (3.5 thresholds). */
	state() {
		if (this.#targetSize <= 0) return "healthy";
		const ratio = this.availableFreeCount() / this.#targetSize;
		if (ratio < .1) return "emergency";
		if (ratio < .3) return "critical";
		if (ratio < .95) return "warning";
		return "healthy";
	}
	/** Admission quota for a refill round: how many free nodes to accept. */
	admissionQuota() {
		return Math.max(0, this.#targetSize - this.availableFreeCount());
	}
	/** Replace the worst free node (C grade / oldest) to make room (3.5). */
	evictWorstFree() {
		let worst = null;
		for (const node of this.#nodes.values()) {
			if (node.source !== "free") continue;
			if (!worst) {
				worst = node;
				continue;
			}
			const gradeRank = {
				S: 0,
				A: 1,
				B: 2,
				C: 3
			};
			const byGrade = gradeRank[node.quality] - gradeRank[worst.quality];
			if (byGrade > 0 || byGrade === 0 && node.addedAt < worst.addedAt) worst = node;
		}
		if (!worst) return false;
		this.remove(worst.id);
		return true;
	}
	/** Is the pool full for free-source admission? (pinned and non-free nodes
	*  never count against the target, 3.5/3.6.) */
	isFreeFull() {
		return this.freeCount() >= this.#targetSize;
	}
	freeCount() {
		let count = 0;
		for (const node of this.#nodes.values()) if (node.source === "free") count += 1;
		return count;
	}
	snapshot() {
		const bySource = {
			free: 0,
			manual: 0,
			subscription: 0,
			goproxy: 0
		};
		for (const node of this.#nodes.values()) bySource[node.source] += 1;
		return {
			state: this.state(),
			total: this.#nodes.size,
			bySource,
			availableFree: this.availableFreeCount(),
			pinned: this.pinnedId
		};
	}
	list() {
		const out = [];
		for (const [id, node] of this.#nodes) {
			const health = this.#health.get(id);
			const bans = [];
			for (const [key, ban] of this.#bans) if (key.startsWith(`${id}\u0000`)) bans.push({
				model: key.slice(id.length + 1),
				ban
			});
			out.push({
				...node,
				health,
				bans
			});
		}
		return out;
	}
};

//#endregion
//#region src/pool/admission.ts
/**
* Coarse screen (admission steps 1+2, docs/ip-pool.md 4.5 修订): one request
* through the candidate to the ip echo. This step touches only the wild
* candidate and a public IP service — never the anonymous lane — so callers
* may fan it out at high concurrency (admissionFanout; GoProxy uses 300 for
* the same reason). Steps 3-4 (which spend anonymous-lane quota) stay on the
* bounded Prober.
*/
async function coarseScreen(deps, candidate, options = {}) {
	const ipEcho = deps.ipEchoUrl ?? DEFAULT_IP_ECHO;
	const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const blocked = new Set(deps.blockedCountries ?? ["CN"]);
	const maxResponseMs = options.relaxed ? RELAXED_RESPONSE_MS : 3e3;
	let agent = null;
	try {
		agent = new deps.undici.ProxyAgent({ uri: candidate.protocol === "socks5" ? `socks5://${candidate.address}` : `http://${candidate.address}` });
	} catch (err) {
		return { rejected: `agent-build: ${err instanceof Error ? err.message : String(err)}` };
	}
	try {
		const started = Date.now();
		const echo = await withTimeout(deps.undici.request(ipEcho, { dispatcher: agent }), timeout, "probe");
		const latencyMs = Date.now() - started;
		if (echo.statusCode !== 200) return { rejected: `echo HTTP ${echo.statusCode}` };
		let body;
		try {
			body = JSON.parse(await echo.body.text());
		} catch {
			return { rejected: "echo body not JSON" };
		}
		if (body.status !== "success" || !body.query) return { rejected: "echo did not report an exit IP" };
		const country = body.countryCode?.toUpperCase() ?? "";
		if (blocked.has(country)) return { rejected: `geo-blocked ${country}` };
		if (latencyMs > maxResponseMs && !options.pinned) return { rejected: `latency ${latencyMs}ms > ${maxResponseMs}ms` };
		return {
			exitIP: body.query,
			exitLocation: `${body.countryCode} ${body.city}`.trim(),
			latencyMs
		};
	} catch (err) {
		return { rejected: err instanceof Error ? err.message : String(err) };
	} finally {
		agent.close().catch(() => {});
	}
}
/** Bounded fan-out helper for the coarse screen (wild candidates only).
*  onProgress reports (screensCompleted, survivorsSoFar) as the fan-out runs
*  (settings-page refill progress, docs §5.3). */
async function coarseScreenBatch(deps, candidates, options = {}) {
	const fanout = Math.max(1, options.fanout ?? 300);
	const results = /* @__PURE__ */ new Map();
	const queue = [...candidates];
	let done = 0;
	const worker = async () => {
		for (;;) {
			const candidate = queue.shift();
			if (candidate === void 0) return;
			const verdict = await coarseScreen(deps, candidate, options);
			done += 1;
			if ("exitIP" in verdict) results.set(candidate.address, verdict);
			options.onProgress?.(done, results.size);
		}
	};
	await Promise.all(Array.from({ length: Math.min(fanout, candidates.length) }, () => worker()));
	return results;
}
const DEFAULT_IP_ECHO = "http://ip-api.com/json/?fields=status,country,countryCode,city,query";
const DEFAULT_TIMEOUT_MS = 8e3;
/** critical-state relaxed latency gate (docs/ip-pool.md 4.6 maxResponseMs). */
const RELAXED_RESPONSE_MS = 6e3;
function withTimeout(promise, ms, label) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(/* @__PURE__ */ new Error(`${label} timed out after ${ms}ms`)), ms);
		promise.then((value) => {
			clearTimeout(timer);
			resolve(value);
		}, (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}
async function admitCandidate(deps, candidate, options = {}) {
	const zenBase = deps.zenBaseUrl ?? ZEN_BASE_URL;
	const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const smokeModel = deps.smokeModel ?? "big-pickle";
	const probeHeaders = disguiseHeaders({
		session: canonicalSessionID(`admission:${candidate.address}`),
		request: randomID("req", 16),
		project: stableID("prj", "opencode2dsh:default-project"),
		parentSession: ""
	});
	let agent = null;
	try {
		agent = new deps.undici.ProxyAgent({ uri: candidate.protocol === "socks5" ? `socks5://${candidate.address}` : `http://${candidate.address}` });
	} catch (err) {
		return {
			admitted: false,
			reason: `agent-build: ${err instanceof Error ? err.message : String(err)}`
		};
	}
	const request = (url, init = {}) => withTimeout(deps.undici.request(url, {
		dispatcher: agent,
		...init
	}), timeout, init.method === "POST" ? "smoke" : "probe");
	try {
		let facts;
		if (options.echoFacts) facts = options.echoFacts;
		else {
			const verdict = await coarseScreen(deps, candidate, options);
			if ("rejected" in verdict) return {
				admitted: false,
				reason: verdict.rejected
			};
			facts = verdict;
		}
		const models = await request(`${zenBase.replace(/\/+$/, "")}/v1/models`, { headers: {
			authorization: "Bearer public",
			"user-agent": opencodeUserAgent(),
			"x-opencode-client": "cli",
			accept: "application/json",
			...probeHeaders
		} });
		if (models.statusCode !== 200) return {
			admitted: false,
			reason: `zen models HTTP ${models.statusCode}`
		};
		const smoke = await request(`${zenBase.replace(/\/+$/, "")}/v1/chat/completions`, {
			method: "POST",
			headers: {
				authorization: "Bearer public",
				"content-type": "application/json",
				"user-agent": opencodeUserAgent(),
				"x-opencode-client": "cli",
				...probeHeaders
			},
			body: JSON.stringify({
				model: smokeModel,
				messages: [{
					role: "user",
					content: "ping"
				}],
				max_tokens: 1,
				stream: true,
				stream_options: { include_usage: true },
				tools: FREE_LANE_GATE_TOOL_NAMES.map((name) => freeLaneGateTool(name)),
				tool_choice: "none"
			})
		});
		if (smoke.statusCode !== 200) {
			if (smoke.statusCode === 429) return {
				admitted: true,
				limited: true,
				reason: `zen smoke HTTP 429`,
				node: {
					id: candidate.address,
					protocol: candidate.protocol,
					source: candidate.source,
					pinned: options.pinned ?? false,
					exitIP: facts.exitIP,
					exitLocation: facts.exitLocation,
					latencyMs: facts.latencyMs,
					quality: gradeOf(facts.latencyMs),
					addedAt: Date.now()
				}
			};
			return {
				admitted: false,
				reason: `zen smoke HTTP ${smoke.statusCode}`
			};
		}
		return {
			admitted: true,
			node: {
				id: candidate.address,
				protocol: candidate.protocol,
				source: candidate.source,
				pinned: options.pinned ?? false,
				exitIP: facts.exitIP,
				exitLocation: facts.exitLocation,
				latencyMs: facts.latencyMs,
				quality: gradeOf(facts.latencyMs),
				addedAt: Date.now()
			}
		};
	} catch (err) {
		return {
			admitted: false,
			reason: err instanceof Error ? err.message : String(err)
		};
	} finally {
		agent.close().catch(() => {});
	}
}
/** Admit a trusted-source candidate (manual/subscription/goproxy): smoke
*  only; failure warns instead of rejecting for pinned (docs 4.5). Existing
*  pool facts are PRESERVED on the failure fallback — a failed smoke wipes
*  neither a previously measured exitIP/latency nor the routing key. */
async function admitTrusted(deps, candidate, options = {}) {
	const result = await admitCandidate(deps, candidate, { pinned: options.pinned });
	if (result.admitted) return result;
	deps.logger?.warn(`opencode2dsh: trusted exit ${candidate.address} failed admission (${result.reason}); admitted with ${options.previous?.exitIP ? "previous" : "unknown"} exit facts`);
	const previous = options.previous;
	return {
		admitted: true,
		node: {
			id: candidate.address,
			protocol: candidate.protocol,
			source: candidate.source,
			pinned: options.pinned ?? false,
			exitIP: previous?.exitIP ?? "",
			exitLocation: previous?.exitLocation ?? "",
			latencyMs: previous?.latencyMs ?? 0,
			quality: previous?.quality ?? gradeOf(previous?.latencyMs ?? 0),
			addedAt: Date.now()
		}
	};
}

//#endregion
export { ExitPool as a, coarseScreenBatch as i, admitTrusted as n, gradeOf as o, coarseScreen as r, admitCandidate as t };