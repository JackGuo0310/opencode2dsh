import "./catalog-BJaRdpHq.js";
import "./messages-PSa7_wRp.js";
import { i as setRotateDelegate, n as createRotateDelegate } from "./rotate-o6Ljmrzr.js";
import { a as ExitPool, i as coarseScreenBatch, n as admitTrusted, o as gradeOf, t as admitCandidate } from "./admission-lBXBoe9h.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { parse } from "yaml";
import { createConnection } from "node:net";

//#region src/pool/prober.ts
var Prober = class {
	#pool;
	#maxConcurrent;
	#queue = [];
	#inFlight = 0;
	#drained = null;
	/** Queue snapshot counter for the settings-page progress (x/y). */
	#enqueued = 0;
	#completed = 0;
	constructor(options) {
		this.#pool = options.pool;
		this.#maxConcurrent = Math.max(1, options.maxConcurrentProbes ?? 3);
	}
	get stats() {
		return {
			queued: this.#queue.length,
			inFlight: this.#inFlight,
			enqueued: this.#enqueued,
			completed: this.#completed
		};
	}
	setMaxConcurrent(value) {
		this.#maxConcurrent = Math.max(1, value);
		this.#pump();
	}
	/** Enqueue one task; resolves when the task has fully run. */
	enqueue(task) {
		this.#enqueued += 1;
		return new Promise((resolve) => {
			this.#queue.push({
				task,
				resolve
			});
			this.#pump();
		});
	}
	/** Enqueue a batch; same-exit tasks are kept adjacent for back-to-back
	*  execution (constraint 3). Resolves when every task has run. */
	enqueueAll(tasks) {
		return Promise.all(tasks.map((task) => this.enqueue(task))).then(() => void 0);
	}
	/** True when no task is queued or running. */
	get idle() {
		return this.#queue.length === 0 && this.#inFlight === 0;
	}
	/** Resolves once the queue fully drains (test/UI hook). */
	async drained() {
		while (!this.idle) await new Promise((resolve) => {
			this.#drained = resolve;
		});
	}
	/** A worker slot finished; release and pump. */
	#finishSlot() {
		this.#inFlight -= 1;
		this.#completed += 1;
		this.#pump();
	}
	#pump() {
		while (this.#inFlight < this.#maxConcurrent) {
			const index = this.#queue.findIndex((slot$1) => !this.#isExitBusy(slot$1.task.exitId));
			if (index < 0) break;
			const [slot] = this.#queue.splice(index, 1);
			if (!slot) break;
			this.#inFlight += 1;
			this.#runSlot(slot);
		}
		if (this.idle) {
			const waiter = this.#drained;
			this.#drained = null;
			waiter?.();
		}
	}
	#isExitBusy(exitId) {
		return this.#pool.get(exitId) !== void 0 && !this.#pool.takeProbeLock(exitId);
	}
	async #runSlot(slot) {
		try {
			await slot.task.run();
		} catch {} finally {
			this.#pool.releaseProbeLock(slot.task.exitId);
			slot.resolve();
			this.#finishSlot();
		}
	}
};

//#endregion
//#region src/pool/sources.ts
const freeSources = [
	{
		url: "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/http.txt",
		protocol: "http",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/socks4.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/ProxyScraper/ProxyScraper/main/socks5.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
		protocol: "http",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt",
		protocol: "http",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/sunny9577/proxy-scraper/generated/http_proxies.txt",
		protocol: "http",
		tier: "fast"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/sunny9577/proxy-scraper/generated/socks5_proxies.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/sunny9577/proxy-scraper/generated/socks4_proxies.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/proxio-io/proxy-list/main/http.txt",
		protocol: "http",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/proxio-io/proxy-list/main/socks5.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt",
		protocol: "http",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
		protocol: "http",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://proxyspace.pro/http.txt",
		protocol: "http",
		tier: "fast"
	},
	{
		url: "https://proxyspace.pro/socks5.txt",
		protocol: "socks5",
		tier: "fast"
	},
	{
		url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/databay-labs/free-proxy-list/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/databay-labs/free-proxy-list/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/Anonym0usWork1221/Free-Proxies/proxy_files/http_proxies.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/Anonym0usWork1221/Free-Proxies/proxy_files/socks5_proxies.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/Anonym0usWork1221/Free-Proxies/proxy_files/socks4_proxies.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/ALIILAPRO/Proxy/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/ALIILAPRO/Proxy/socks4.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/vakhov/fresh-proxy-list/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/vakhov/fresh-proxy-list/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/vakhov/fresh-proxy-list/socks4.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/Zaeem20/FREE_PROXIES_LIST/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/hookzof/socks5_list/proxy.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/proxy4parsing/proxy-list/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://cdn.jsdelivr.net/gh/proxy4parsing/proxy-list/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/Tianndev/free-proxy/main/proxy/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/Tianndev/free-proxy/main/proxy/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/protocols/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/proxmint/free-proxy-list/main/proxies/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/proxmint/free-proxy-list/main/proxies/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/Ian-Lusule/Proxies/main/proxies/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://raw.githubusercontent.com/Ian-Lusule/Proxies/main/proxies/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "http://openproxylist.xyz/http.txt",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "http://openproxylist.xyz/socks5.txt",
		protocol: "socks5",
		tier: "slow"
	},
	{
		url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all",
		protocol: "http",
		tier: "slow"
	},
	{
		url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all",
		protocol: "socks5",
		tier: "slow"
	}
];
/** One raw free-list line -> host:port address, or null when malformed. */
function parseFreeListLine(line) {
	const trimmed = line.trim();
	if (trimmed === "" || trimmed.startsWith("#")) return null;
	const address = trimmed.replace(/^[a-z0-9+.-]+:\/\//i, "");
	const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(address);
	if (!match?.[1] || !match[2]) return null;
	const port = Number(match[2]);
	if (port < 1 || port > 65535) return null;
	return {
		address,
		host: match[1],
		port
	};
}
/** Deduplicate a raw address list while preserving order. */
function dedupeAddresses(lines) {
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const line of lines) {
		const parsed = parseFreeListLine(line);
		if (!parsed) continue;
		if (seen.has(parsed.address)) continue;
		seen.add(parsed.address);
		out.push(parsed);
	}
	return out;
}
/**
* Per-source circuit breaker (GoProxy SourceManager semantics, in-memory):
* N consecutive fetch failures disable the source for a cooldown, after which
* it is re-enabled with its counter reset.
*/
var SourceBreaker = class {
	#entries = /* @__PURE__ */ new Map();
	#threshold;
	#cooldownMs;
	#now;
	constructor(options = {}) {
		this.#threshold = options.failureThreshold ?? 3;
		this.#cooldownMs = options.cooldownMs ?? 10 * 6e4;
		this.#now = options.now ?? Date.now;
	}
	canUse(url) {
		const entry = this.#entries.get(url);
		if (!entry) return true;
		if (entry.disabledUntil > this.#now()) return false;
		if (entry.consecutiveFails >= this.#threshold) {
			entry.consecutiveFails = 0;
			entry.disabledUntil = 0;
		}
		return true;
	}
	recordSuccess(url) {
		this.#entries.set(url, {
			consecutiveFails: 0,
			disabledUntil: 0
		});
	}
	recordFailure(url) {
		const entry = this.#entries.get(url) ?? {
			consecutiveFails: 0,
			disabledUntil: 0
		};
		entry.consecutiveFails += 1;
		if (entry.consecutiveFails >= this.#threshold) entry.disabledUntil = this.#now() + this.#cooldownMs;
		this.#entries.set(url, entry);
	}
	disabledCount() {
		let count = 0;
		for (const entry of this.#entries.values()) if (entry.disabledUntil > this.#now()) count += 1;
		return count;
	}
};
/** Select sources for a refill round by pool state (docs/ip-pool.md 3.5):
*  warning/critical -> fast tier; emergency -> all sources (breaker ignored). */
function selectSources(state) {
	if (state === "emergency") return freeSources;
	if (state === "healthy") return [];
	return freeSources.filter((source) => source.tier === "fast");
}
/** Fetch one source and parse its list. Transport errors propagate to the
*  caller (the breaker records them); HTTP-level failures throw. */
async function fetchSource(source, fetchImpl = fetch, timeoutMs = 3e4) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(source.url, { signal: controller.signal });
		if (!response.ok) throw new Error(`source ${source.url} returned HTTP ${response.status}`);
		return {
			source,
			addresses: dedupeAddresses((await response.text()).split(/\r?\n/))
		};
	} finally {
		clearTimeout(timer);
	}
}

//#endregion
//#region src/pool/refill.ts
var RefillScheduler = class {
	#pool;
	#deps;
	#breaker = new SourceBreaker();
	#intervalMs;
	/** Candidate cap per source per round (a source can return thousands of
	*  rows; admission cost is 4 requests per candidate). */
	#maxPerRound;
	#timer = null;
	#running = false;
	#stopped = false;
	#lastRound = {
		admitted: 0,
		rejected: 0,
		fetched: 0,
		coarsePassed: 0,
		state: "healthy",
		at: 0
	};
	/** Live progress of the in-flight round (settings page 立即补充 feedback). */
	#progress = {
		running: false,
		stage: "idle",
		sourcesDone: 0,
		sourcesTotal: 0,
		fetched: 0,
		candidates: 0,
		coarsePassed: 0,
		coarseDone: 0,
		admissions: 0,
		admitted: 0
	};
	/** Notified after every real admission — the runtime assembly uses it to
	*  engage routing the moment a free-source pool stops being empty (the
	*  initial install is skipped exactly then, live-observed 2026-09-09). */
	#admittedCallbacks = [];
	constructor(pool, deps, options = {}) {
		this.#pool = pool;
		this.#deps = deps;
		this.#intervalMs = options.intervalMs ?? 10 * 6e4;
		this.#maxPerRound = options.maxAdmissionsPerRound ?? 10;
	}
	/** Register a callback fired after every node the round really admits. */
	onAdmitted(callback) {
		this.#admittedCallbacks.push(callback);
	}
	#notifyAdmitted() {
		for (const callback of this.#admittedCallbacks) try {
			callback();
		} catch {}
	}
	get lastRound() {
		return this.#lastRound;
	}
	/** The in-flight round's live progress (status bridge, docs §5.3). */
	get progress() {
		return { ...this.#progress };
	}
	/** Start the periodic refill check (one round immediately). */
	start() {
		if (this.#timer !== null || this.#stopped) return;
		this.tick();
		this.#timer = setInterval(() => void this.tick(), this.#intervalMs);
		this.#timer.unref?.();
	}
	stop() {
		this.#stopped = true;
		if (this.#timer !== null) {
			clearInterval(this.#timer);
			this.#timer = null;
		}
	}
	/** One refill round; skipped while a previous round is still draining. */
	async tick() {
		if (this.#running) return;
		this.#running = true;
		try {
			await this.#round();
		} finally {
			this.#running = false;
		}
	}
	async #round() {
		const state = this.#pool.state();
		const quota = Math.min(this.#pool.admissionQuota(), this.#maxPerRound);
		this.#lastRound = {
			...this.#lastRound,
			state,
			at: Date.now()
		};
		if (state === "healthy" || quota <= 0) {
			this.#progress = {
				running: false,
				stage: "idle",
				sourcesDone: 0,
				sourcesTotal: 0,
				fetched: 0,
				candidates: 0,
				coarsePassed: 0,
				coarseDone: 0,
				admissions: 0,
				admitted: 0
			};
			return;
		}
		const sources = selectSources(state).filter((source) => state === "emergency" || this.#breaker.canUse(source.url));
		this.#progress = {
			running: true,
			stage: "fetch",
			sourcesDone: 0,
			sourcesTotal: sources.length,
			fetched: 0,
			candidates: 0,
			coarsePassed: 0,
			coarseDone: 0,
			admissions: 0,
			admitted: 0
		};
		let fetched = 0;
		let admitted = 0;
		let rejected = 0;
		const candidateCap = 2e4;
		const perSourceCap = 5e3;
		const candidates = [];
		const seen = new Set(this.#poolAddresses());
		for (const source of sources) {
			if (candidates.length >= candidateCap) break;
			try {
				const result = this.#deps.fetchSourceImpl ? await this.#deps.fetchSourceImpl(source, this.#deps.fetchImpl ?? fetch) : await fetchSource(source, this.#deps.fetchImpl ?? fetch);
				this.#breaker.recordSuccess(source.url);
				fetched += result.addresses.length;
				this.#progress.fetched = fetched;
				this.#progress.sourcesDone += 1;
				this.#progress.candidates = candidates.length;
				const rows = result.addresses.slice();
				for (let i = rows.length - 1; i > 0; i -= 1) {
					const j = Math.floor(Math.random() * (i + 1));
					[rows[i], rows[j]] = [rows[j], rows[i]];
				}
				let fromThisSource = 0;
				for (const entry of rows) {
					if (candidates.length >= candidateCap) break;
					if (fromThisSource >= perSourceCap) break;
					if (seen.has(entry.address)) continue;
					seen.add(entry.address);
					if (source.protocol !== "http") continue;
					candidates.push({
						...entry,
						protocol: "http"
					});
					fromThisSource += 1;
				}
				this.#progress.candidates = candidates.length;
			} catch {
				this.#breaker.recordFailure(source.url);
				this.#progress.sourcesDone += 1;
			}
		}
		this.#progress.stage = "coarse";
		const relaxed = state === "critical" || state === "emergency";
		const facts = await coarseScreenBatch(this.#deps, candidates, {
			fanout: this.#deps.admissionFanout ?? 300,
			relaxed,
			timeoutMs: 5e3,
			onProgress: (done, passed) => {
				this.#progress.coarseDone = done;
				this.#progress.coarsePassed = passed;
			}
		});
		rejected += candidates.length - facts.size;
		this.#progress.stage = "admit";
		this.#lastRound = {
			admitted,
			rejected,
			fetched,
			state,
			at: Date.now(),
			coarsePassed: facts.size
		};
		const tasks = [];
		let admittedLimited = 0;
		let claimed = 0;
		const survivors = candidates.filter((candidate) => facts.has(candidate.address)).sort((left, right) => (facts.get(left.address)?.latencyMs ?? 0) - (facts.get(right.address)?.latencyMs ?? 0));
		for (const candidate of survivors) {
			const echoFacts = facts.get(candidate.address);
			if (!echoFacts) continue;
			tasks.push({
				exitId: candidate.address,
				kind: "admission",
				run: async () => {
					if (claimed >= quota || this.#pool.admissionQuota() <= 0) return;
					claimed += 1;
					try {
						const verdict = await admitCandidate(this.#deps, {
							address: candidate.address,
							protocol: candidate.protocol,
							source: "free"
						}, {
							relaxed,
							echoFacts
						});
						if (verdict.admitted && verdict.node) {
							if (this.#pool.isFreeFull()) this.#pool.evictWorstFree();
							if (this.#pool.add(verdict.node)) {
								if (verdict.limited) {
									this.#pool.markLimited(verdict.node.id);
									admittedLimited += 1;
								} else {
									this.#pool.markOk(verdict.node.id);
									admitted += 1;
								}
								this.#progress.admitted = admitted + admittedLimited;
								this.#notifyAdmitted();
							}
						} else rejected += 1;
					} finally {
						this.#progress.admissions += 1;
					}
				}
			});
		}
		if (tasks.length > 0) {
			await this.#deps.prober.enqueueAll(tasks);
			this.#lastRound = {
				...this.#lastRound,
				admitted: admitted + admittedLimited,
				rejected,
				at: Date.now()
			};
		}
		this.#progress.running = false;
		this.#progress.stage = "idle";
	}
	#poolAddresses() {
		return new Set(this.#pool.list().map((entry) => entry.id));
	}
};

//#endregion
//#region src/pool/subscription.ts
const SUPPORTED_TYPES = new Set([
	"vmess",
	"vless",
	"trojan",
	"shadowsocks",
	"shadowsocksr",
	"hysteria",
	"hysteria2",
	"tuic",
	"anytls",
	"http",
	"socks5"
]);
/** GoProxy looksLikeYAML: the structural markers of a Clash config. */
function looksLikeYaml(content) {
	if (/^proxies:\s*$/m.test(content) || /^Proxy:\s*$/m.test(content)) return true;
	if (content.includes("proxies:") && content.includes("- name:")) return true;
	return /^---\s*$/m.test(content) && content.includes("port:");
}
/** GoProxy looksLikeProxyLinks. */
function looksLikeProxyLinks(content) {
	return content.includes("vmess://") || content.includes("vless://") || content.includes("trojan://") || content.includes("ss://") || content.includes("ssr://") || content.includes("hysteria2://") || content.includes("hy2://") || content.includes("tuic://");
}
/** Base64 decode tolerant of the variants subscriptions actually use
*  (missing padding, URL-safe alphabet, embedded newlines). */
function tryBase64Decode(content) {
	const compact = content.replace(/\s+/g, "");
	if (compact.length < 8) return null;
	const normalized = compact.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	try {
		const decoded = Buffer.from(padded, "base64").toString("utf8");
		if (Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_") !== compact.replace(/=+$/, "")) return null;
		if (decoded.includes("\0")) return null;
		return decoded;
	} catch {
		return null;
	}
}
/** One Clash YAML proxy entry -> ParsedNode (GoProxy parseClashProxy). */
function parseClashProxy(proxy) {
	if (typeof proxy !== "object" || proxy === null) return null;
	const type = typeof proxy.type === "string" ? proxy.type.toLowerCase() : "";
	const server = typeof proxy.server === "string" ? proxy.server : "";
	if (type === "" || server === "") return null;
	let port = 0;
	const rawPort = proxy.port;
	if (typeof rawPort === "number" && Number.isFinite(rawPort)) port = rawPort;
	else if (typeof rawPort === "string" && /^\d+$/.test(rawPort)) port = Number(rawPort);
	if (port < 1 || port > 65535) return null;
	const normalized = type === "ss" ? "shadowsocks" : type === "ssr" ? "shadowsocksr" : type;
	if (!SUPPORTED_TYPES.has(normalized)) return null;
	return {
		name: typeof proxy.name === "string" && proxy.name.length > 0 ? proxy.name : `${server}:${port}`,
		type: normalized,
		server,
		port,
		raw: proxy
	};
}
/** Clash YAML document -> nodes (new `proxies` + legacy `Proxy` layouts). */
function parseClashYaml(content) {
	let document;
	try {
		document = parseYamlDocument(content);
	} catch {
		return {
			nodes: [],
			skipped: 0
		};
	}
	if (typeof document !== "object" || document === null) return {
		nodes: [],
		skipped: 0
	};
	const config = document;
	const proxyLists = [config.proxies, config.Proxy].filter((value) => Array.isArray(value));
	const nodes = [];
	let skipped = 0;
	for (const list of proxyLists) for (const entry of list) {
		const node = parseClashProxy(entry);
		if (node) nodes.push(node);
		else skipped += 1;
	}
	return {
		nodes,
		skipped
	};
}
function parseYamlDocument(content) {
	return parse(content);
}
/** vmess:// V2rayN base64-JSON link (GoProxy parseVmessLink). */
function parseVmessLink(link) {
	const decoded = tryBase64Decode(link.slice(8));
	if (decoded === null) return null;
	let info;
	try {
		info = JSON.parse(decoded);
	} catch {
		return null;
	}
	const server = String(info.add ?? "");
	const port = Number(info.port ?? 0);
	if (server === "" || !Number.isFinite(port) || port < 1) return null;
	const name = typeof info.ps === "string" && info.ps.length > 0 ? info.ps : server;
	const raw = {
		type: "vmess",
		name,
		server,
		port,
		uuid: String(info.id ?? ""),
		alterId: Number(info.aid ?? 0) || 0,
		cipher: typeof info.scy === "string" ? info.scy : "auto"
	};
	if (String(info.tls) === "tls") {
		raw.tls = true;
		if (typeof info.sni === "string" && info.sni) raw.sni = info.sni;
	}
	const network = typeof info.net === "string" ? info.net : "tcp";
	raw.network = network;
	if (network === "ws") {
		const wsOpts = {};
		if (typeof info.path === "string" && info.path) wsOpts.path = info.path;
		if (typeof info.host === "string" && info.host) wsOpts.headers = { Host: info.host };
		raw["ws-opts"] = wsOpts;
	} else if (network === "grpc") {
		const grpcOpts = {};
		if (typeof info.path === "string" && info.path) grpcOpts["grpc-service-name"] = info.path;
		raw["grpc-opts"] = grpcOpts;
	}
	return {
		name,
		type: "vmess",
		server,
		port,
		raw
	};
}
/** Standard URI link (vless/trojan/hysteria2/tuic) — GoProxy parseStandardLink. */
function parseStandardLink(link, type) {
	let url;
	try {
		url = new URL(link);
	} catch {
		return null;
	}
	const server = url.hostname.replace(/^\[|\]$/g, "");
	let port = Number(url.port);
	if (!Number.isFinite(port) || port < 1) port = 443;
	const name = decodeURIComponent(url.hash.slice(1)) || server;
	const raw = {
		type,
		name,
		server,
		port
	};
	const username = url.username ? decodeURIComponent(url.username) : "";
	if (username !== "") {
		if (type === "trojan" || type === "hysteria2") raw.password = username;
		else if (type === "vless" || type === "tuic") {
			raw.uuid = username;
			if (url.password) raw.password = decodeURIComponent(url.password);
		}
	}
	for (const [key, value] of url.searchParams) raw[key] = value;
	return {
		name,
		type,
		server,
		port,
		raw
	};
}
/** ss:// link (GoProxy parseShadowsocksLink, both layout variants). */
function parseShadowsocksLink(link) {
	const hashIndex = link.indexOf("#");
	const name = hashIndex >= 0 ? decodeURIComponent(link.slice(hashIndex + 1)) : "";
	const body = hashIndex >= 0 ? link.slice(5, hashIndex) : link.slice(5);
	const at = body.lastIndexOf("@");
	if (at > 0) {
		const userinfo = tryBase64Decode(body.slice(0, at));
		const hostPart = body.slice(at + 1);
		const hostMatch = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(hostPart);
		if (userinfo === null || !hostMatch?.[1] || !hostMatch[2]) return null;
		const port$1 = Number(hostMatch[2]);
		if (port$1 < 1) return null;
		const server$1 = hostMatch[1].replace(/^\[|\]$/g, "");
		return {
			name: name || server$1,
			type: "shadowsocks",
			server: server$1,
			port: port$1,
			raw: {
				type: "shadowsocks",
				name: name || server$1,
				server: server$1,
				port: port$1,
				cipher: userinfo
			}
		};
	}
	const decoded = tryBase64Decode(body);
	if (decoded === null) return null;
	const match = /^(\S+?)@(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(decoded);
	if (!match?.[1] || !match[2] || !match[3]) return null;
	const port = Number(match[3]);
	const server = match[2].replace(/^\[|\]$/g, "");
	const colon = match[1].indexOf(":");
	const method = colon > 0 ? match[1].slice(0, colon) : match[1];
	const password = colon > 0 ? match[1].slice(colon + 1) : "";
	return {
		name: name || server,
		type: "shadowsocks",
		server,
		port,
		raw: {
			type: "shadowsocks",
			name: name || server,
			server,
			port,
			method,
			password
		}
	};
}
/** One protocol link line -> node (GoProxy parseProxyLink). */
function parseProxyLink(link) {
	const value = link.trim();
	if (value.startsWith("vmess://")) return parseVmessLink(value);
	if (value.startsWith("vless://")) return parseStandardLink(value, "vless");
	if (value.startsWith("trojan://")) return parseStandardLink(value, "trojan");
	if (value.startsWith("ss://")) return parseShadowsocksLink(value);
	if (value.startsWith("hysteria2://") || value.startsWith("hy2://")) return parseStandardLink(value, "hysteria2");
	if (value.startsWith("tuic://")) return parseStandardLink(value, "tuic");
	return null;
}
/** Protocol-link document -> nodes (skipping unparsable lines). */
function parseProxyLinks(content) {
	const nodes = [];
	let skipped = 0;
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const node = parseProxyLink(line);
		if (node) nodes.push(node);
		else skipped += 1;
	}
	return {
		nodes,
		skipped
	};
}
/** GoProxy parsePlain: bare host:port lines (direct http/socks5 nodes). */
function parsePlainAddresses(content) {
	const nodes = [];
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		let protocol = "http";
		let address = line;
		const scheme = /^([a-z0-9+.-]+):\/\//i.exec(line);
		if (scheme) {
			const name = scheme[1].toLowerCase();
			address = line.slice(scheme[0].length);
			if (name === "socks5" || name === "socks4" || name === "socks5h") protocol = "socks5";
			else if (name !== "http" && name !== "https") continue;
		}
		const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(address);
		if (!match) continue;
		const port = Number(match[2]);
		if (port < 1 || port > 65535) continue;
		const server = match[1].replace(/^\[|\]$/g, "");
		nodes.push({
			name: address,
			type: protocol,
			server,
			port,
			raw: {
				type: protocol,
				server,
				port
			}
		});
	}
	return nodes;
}
/**
* Parse a subscription body with format auto-detection (GoProxy
* parseAutoDetect, same probe order). Never throws: unknown formats report
* zero nodes with `detected` left as the closest guess.
*/
function parseSubscription(content) {
	const trimmed = content.trim();
	if (trimmed === "") return {
		nodes: [],
		detected: "plain",
		skipped: 0
	};
	if (looksLikeYaml(trimmed)) {
		const { nodes, skipped } = parseClashYaml(trimmed);
		if (nodes.length > 0) return {
			nodes,
			detected: "clash-yaml",
			skipped
		};
	}
	if (looksLikeProxyLinks(trimmed)) {
		const { nodes, skipped } = parseProxyLinks(trimmed);
		if (nodes.length > 0) return {
			nodes,
			detected: "proxy-links",
			skipped
		};
	}
	const decoded = tryBase64Decode(trimmed);
	if (decoded !== null) {
		if (looksLikeYaml(decoded)) {
			const { nodes, skipped } = parseClashYaml(decoded);
			if (nodes.length > 0) return {
				nodes,
				detected: "base64:clash-yaml",
				skipped
			};
		}
		if (looksLikeProxyLinks(decoded)) {
			const { nodes, skipped } = parseProxyLinks(decoded);
			if (nodes.length > 0) return {
				nodes,
				detected: "base64:proxy-links",
				skipped
			};
		}
		const plain$1 = parsePlainAddresses(decoded);
		if (plain$1.length > 0) return {
			nodes: plain$1,
			detected: "plain",
			skipped: 0
		};
	}
	const plain = parsePlainAddresses(trimmed);
	if (plain.length > 0) return {
		nodes: plain,
		detected: "plain",
		skipped: 0
	};
	return {
		nodes: [],
		detected: "plain",
		skipped: 0
	};
}

//#endregion
//#region src/pool/singbox.ts
const getStr = (raw, key) => {
	const value = raw[key];
	return typeof value === "string" ? value : value === void 0 || value === null ? "" : String(value);
};
const getStrDefault = (raw, key, fallback) => {
	const value = getStr(raw, key);
	return value !== "" ? value : fallback;
};
const getInt = (raw, key) => {
	const value = Number(raw[key]);
	return Number.isFinite(value) ? value : 0;
};
const getBool = (raw, key) => raw[key] === true;
function applyTLS(raw, out) {
	if (!(getBool(raw, "tls") || getStr(raw, "sni") !== "" || getStr(raw, "client-fingerprint") !== "" || raw["reality-opts"] !== void 0 && typeof raw["reality-opts"] === "object")) return;
	const tls = { enabled: true };
	const sni = getStr(raw, "sni") || getStr(raw, "servername");
	if (sni !== "") tls.server_name = sni;
	if (getBool(raw, "skip-cert-verify")) tls.insecure = true;
	const alpn = raw.alpn;
	if (Array.isArray(alpn)) {
		const list = alpn.filter((entry) => typeof entry === "string");
		if (list.length > 0) tls.alpn = list;
	}
	const fingerprint = getStr(raw, "client-fingerprint");
	if (fingerprint !== "") tls.utls = {
		enabled: true,
		fingerprint
	};
	const reality = raw["reality-opts"];
	if (reality && typeof reality === "object") {
		const opts = reality;
		tls.reality = {
			enabled: true,
			public_key: getStr(opts, "public-key"),
			short_id: getStr(opts, "short-id")
		};
	}
	out.tls = tls;
}
function applyTransport(raw, out) {
	const network = getStrDefault(raw, "network", "tcp");
	if (network === "ws") {
		const transport = { type: "ws" };
		const opts = raw["ws-opts"];
		if (opts && typeof opts === "object") {
			const ws = opts;
			const path = getStr(ws, "path");
			if (path !== "") transport.path = path;
			const headers = ws.headers;
			if (headers && typeof headers === "object") transport.headers = headers;
		}
		out.transport = transport;
	} else if (network === "grpc") {
		const transport = { type: "grpc" };
		const opts = raw["grpc-opts"];
		if (opts && typeof opts === "object") {
			const sn = getStr(opts, "grpc-service-name");
			if (sn !== "") transport.service_name = sn;
		}
		out.transport = transport;
	} else if (network === "h2") {
		const transport = { type: "http" };
		const opts = raw["h2-opts"];
		if (opts && typeof opts === "object") {
			const h2 = opts;
			const path = getStr(h2, "path");
			if (path !== "") transport.path = path;
			const host = h2.host;
			if (Array.isArray(host) && typeof host[0] === "string") transport.host = [host[0]];
		}
		out.transport = transport;
	} else if (network === "httpupgrade") {
		const transport = { type: "httpupgrade" };
		const opts = raw["ws-opts"];
		if (opts && typeof opts === "object") {
			const ws = opts;
			const path = getStr(ws, "path");
			if (path !== "") transport.path = path;
			const headers = ws.headers;
			if (headers && typeof headers === "object") {
				const host = headers.Host;
				if (typeof host === "string") transport.host = host;
			}
		}
		out.transport = transport;
	}
}
/** One ParsedNode -> one sing-box outbound (GoProxy buildOutbound). */
function buildOutbound(node, tag) {
	const raw = node.raw;
	const out = {
		tag,
		server: node.server,
		server_port: node.port
	};
	switch (node.type) {
		case "vmess":
			out.type = "vmess";
			out.uuid = getStr(raw, "uuid");
			out.alter_id = getInt(raw, "alterId");
			out.security = getStrDefault(raw, "cipher", "auto");
			applyTLS(raw, out);
			applyTransport(raw, out);
			break;
		case "vless":
			out.type = "vless";
			out.uuid = getStr(raw, "uuid");
			const flow = getStr(raw, "flow");
			if (flow !== "") out.flow = flow;
			applyTLS(raw, out);
			applyTransport(raw, out);
			break;
		case "trojan":
			out.type = "trojan";
			out.password = getStr(raw, "password");
			applyTLS(raw, out);
			applyTransport(raw, out);
			break;
		case "shadowsocks": {
			out.type = "shadowsocks";
			out.method = getStr(raw, "cipher") || getStr(raw, "method");
			out.password = getStr(raw, "password");
			const plugin = getStr(raw, "plugin");
			if (plugin !== "") {
				out.plugin = plugin;
				const opts = raw["plugin-opts"];
				if (opts && typeof opts === "object") out.plugin_opts = Object.entries(opts).map(([key, value]) => `${key}=${String(value)}`).join(";");
			}
			break;
		}
		case "hysteria2":
			out.type = "hysteria2";
			out.password = getStr(raw, "password");
			applyTLS({
				...raw,
				tls: true
			}, out);
			break;
		case "tuic":
			out.type = "tuic";
			out.uuid = getStr(raw, "uuid");
			out.password = getStr(raw, "password");
			out.congestion_control = getStrDefault(raw, "congestion-controller", "bbr");
			applyTLS({
				...raw,
				tls: true
			}, out);
			break;
		case "anytls":
			out.type = "anytls";
			out.password = getStr(raw, "password");
			applyTLS({
				...raw,
				tls: true
			}, out);
			break;
		default: return null;
	}
	return out;
}
/** nodeKey (GoProxy): type:server:port. */
function nodeKeyOf(node) {
	return `${node.type}:${node.server}:${node.port}`;
}
/** The full sing-box config for a node list (GoProxy generateConfig). */
function generateConfig(nodes, basePort = 3e4) {
	const portMap = /* @__PURE__ */ new Map();
	const inbounds = [];
	const outbounds = [];
	const rules = [];
	let port = basePort;
	nodes.forEach((node, index) => {
		port += 1;
		const tag = `node-${index}`;
		portMap.set(nodeKeyOf(node), port);
		inbounds.push({
			type: "socks",
			tag: `in-${tag}`,
			listen: "127.0.0.1",
			listen_port: port
		});
		const outbound = buildOutbound(node, `out-${tag}`);
		if (outbound === null) {
			portMap.delete(nodeKeyOf(node));
			inbounds.pop();
			return;
		}
		outbounds.push(outbound);
		rules.push({
			inbound: [`in-${tag}`],
			outbound: `out-${tag}`
		});
	});
	outbounds.push({
		type: "direct",
		tag: "direct"
	});
	return {
		config: {
			log: { level: "warn" },
			inbounds,
			outbounds,
			route: {
				rules,
				final: "direct"
			}
		},
		portMap
	};
}
const STOP_GRACE_MS = 5e3;
function canConnect(port, timeoutMs = 1e3) {
	return new Promise((resolve) => {
		const socket = createConnection({
			host: "127.0.0.1",
			port
		});
		const finish = (ok) => {
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(timeoutMs, () => finish(false));
		socket.once("connect", () => finish(true));
		socket.once("error", () => finish(false));
	});
}
var SingBoxSupervisor = class {
	#options;
	#child = null;
	#running = false;
	#configPath;
	#dataDir;
	#portMap = /* @__PURE__ */ new Map();
	#nodes = [];
	constructor(options) {
		this.#options = options;
		this.#dataDir = options.dataDir;
		this.#configPath = join(options.dataDir, "singbox-config.json");
	}
	/** Live re-apply of the binary path (settings page, docs §5.1). The next
	*  reload() resolves through it; a running child keeps serving until then. */
	setBinPath(path) {
		this.#options.binPath = path;
	}
	get running() {
		return this.#running;
	}
	get portMap() {
		return new Map(this.#portMap);
	}
	/** The binary location: absolute path as-is; bare name must exist on PATH
	*  (verified through `sing-box version` — LookPath equivalent). */
	async #resolveBinary() {
		const bin = this.#options.binPath;
		if (bin.includes("/") || bin.includes("\\") || bin.includes(":")) {
			if (existsSync(bin)) return bin;
			throw new Error(`sing-box not found at ${bin}`);
		}
		if (!await new Promise((resolve) => {
			const child = spawn(bin, ["version"], { stdio: "ignore" });
			child.once("error", () => resolve(false));
			child.once("exit", (code) => resolve(code === 0));
		})) throw new Error(`sing-box not found on PATH ("${bin}"); install it or set singbox.path`);
		return bin;
	}
	/** Full reload: regenerate the config for the node list and (re)start. */
	async reload(nodes) {
		if (nodes.length === 0) {
			await this.stop();
			this.#nodes = [];
			this.#portMap = /* @__PURE__ */ new Map();
			return [];
		}
		const binary = await this.#resolveBinary();
		const { config, portMap } = generateConfig(nodes, this.#options.basePort ?? 3e4);
		await mkdir(this.#dataDir, { recursive: true });
		const tmp = `${this.#configPath}.tmp`;
		await writeFile(tmp, JSON.stringify(config, null, 2), "utf8");
		await rm(this.#configPath, { force: true });
		await rename(tmp, this.#configPath);
		if (!await new Promise((resolve) => {
			const child$1 = spawn(binary, [
				"check",
				"-c",
				this.#configPath,
				"-D",
				this.#dataDir
			], { stdio: "ignore" });
			child$1.once("error", () => resolve(false));
			child$1.once("exit", (code) => resolve(code === 0));
		})) throw new Error("sing-box config check failed (run `sing-box check` on the generated config for details)");
		await this.stop();
		this.#child = spawn(binary, [
			"run",
			"-c",
			this.#configPath,
			"-D",
			this.#dataDir
		], { stdio: [
			"ignore",
			"ignore",
			"pipe"
		] });
		const child = this.#child;
		this.#running = true;
		this.#nodes = nodes;
		this.#portMap = portMap;
		child.stderr?.on("data", (chunk) => {
			const text = chunk.toString("utf8").trim();
			if (text.length > 0) this.#options.logger?.info(`[sing-box] ${text}`);
		});
		child.once("exit", () => {
			if (this.#child === child) this.#running = false;
		});
		child.once("error", () => {
			if (this.#child === child) this.#running = false;
		});
		const deadline = Date.now() + (this.#options.readyTimeoutMs ?? 1e4);
		const ports = [...portMap.values()];
		let ready = false;
		while (Date.now() < deadline && !ready) {
			if (!this.#running) throw new Error("sing-box exited immediately after start (see logs)");
			await new Promise((resolve) => setTimeout(resolve, 500));
			for (const port of ports) if (await canConnect(port)) {
				ready = true;
				break;
			}
		}
		if (!ready) this.#options.logger?.warn("opencode2dsh: sing-box ports not ready in time; some converted nodes may be unreachable");
		const exits = [];
		for (const node of nodes) {
			const port = portMap.get(nodeKeyOf(node));
			if (port === void 0) continue;
			exits.push({
				address: `127.0.0.1:${port}`,
				protocol: "socks5",
				node
			});
		}
		return exits;
	}
	/** Graceful stop: interrupt -> grace -> kill (taskkill /T on Windows). */
	async stop() {
		const child = this.#child;
		if (child === null || child.exitCode !== null) {
			this.#running = false;
			return;
		}
		this.#child = null;
		if (process.platform === "win32" && child.pid) await new Promise((resolve) => {
			const killer = spawn("taskkill", [
				"/T",
				"/PID",
				String(child.pid)
			], { stdio: "ignore" });
			killer.once("exit", () => resolve());
			killer.once("error", () => resolve());
		});
		else child.kill("SIGINT");
		const exited = new Promise((resolve) => child.once("exit", () => resolve()));
		const grace = new Promise((resolve) => setTimeout(() => resolve("timeout"), STOP_GRACE_MS));
		if (await Promise.race([exited.then(() => "exit"), grace]) === "timeout") {
			if (process.platform === "win32" && child.pid) await new Promise((resolve) => {
				const killer = spawn("taskkill", [
					"/T",
					"/F",
					"/PID",
					String(child.pid)
				], { stdio: "ignore" });
				killer.once("exit", () => resolve());
				killer.once("error", () => resolve());
			});
			else child.kill("SIGKILL");
			await exited;
		}
		this.#running = false;
	}
};

//#endregion
//#region src/pool/subscription-fetcher.ts
var SubscriptionFetcher = class {
	#deps;
	#urls = [];
	#state = {
		pendingConversion: [],
		convertedAdmitted: 0,
		lastFetch: 0,
		lastError: "",
		plaintextAdmitted: 0
	};
	#timer = null;
	#running = false;
	#stopped = false;
	#intervalMs;
	#timeoutMs;
	#logger;
	constructor(deps, options = {}) {
		this.#deps = deps;
		this.#intervalMs = options.intervalMs ?? 30 * 6e4;
		this.#timeoutMs = options.timeoutMs ?? 3e4;
		this.#logger = options.logger;
	}
	get state() {
		return {
			...this.#state,
			pendingConversion: [...this.#state.pendingConversion]
		};
	}
	/** Configured URL count (status bridge; the URLs themselves never ride out). */
	get urlCount() {
		return this.#urls.length;
	}
	/** Update the subscription URL list (settings change); refresh follows. */
	setUrls(urls) {
		this.#urls = urls.filter((url) => url.trim().length > 0);
	}
	/** Live re-apply of the refresh interval (settings page, docs §5.1). */
	setIntervalMs(ms) {
		this.#intervalMs = Math.max(6e4, ms);
		if (this.#timer !== null) {
			clearInterval(this.#timer);
			this.#timer = setInterval(() => void this.refresh(), this.#intervalMs);
			this.#timer.unref?.();
		}
	}
	/** Manual refresh trigger (settings page 立即刷新, docs §5.3 /probe scope: 'refill' parity). */
	async refreshNow() {
		return this.refresh();
	}
	start() {
		if (this.#timer !== null || this.#stopped) return;
		this.refresh();
		this.#timer = setInterval(() => void this.refresh(), this.#intervalMs);
		this.#timer.unref?.();
	}
	stop() {
		this.#stopped = true;
		if (this.#timer !== null) {
			clearInterval(this.#timer);
			this.#timer = null;
		}
		this.#deps.supervisor?.stop().catch(() => {});
	}
	/** One refresh round over every URL; never overlaps itself. */
	async refresh() {
		if (this.#running) return this.state;
		this.#running = true;
		try {
			const pending = [];
			const plaintext = [];
			let lastError = "";
			for (const url of this.#urls) try {
				const report = parseSubscription(await this.#fetch(url));
				for (const node of report.nodes) if (node.type === "http" || node.type === "socks5") plaintext.push({
					address: `${node.server}:${node.port}`,
					protocol: node.type
				});
				else pending.push(node);
				this.#logger?.info(`opencode2dsh: subscription parsed ${report.nodes.length} node(s) (${report.detected}) from ${this.#redact(url)}`);
			} catch (err) {
				lastError = err instanceof Error ? err.message : String(err);
				this.#logger?.warn(`opencode2dsh: subscription fetch failed for ${this.#redact(url)}: ${lastError}`);
			}
			this.#state = {
				pendingConversion: pending,
				convertedAdmitted: 0,
				lastFetch: Date.now(),
				lastError,
				plaintextAdmitted: 0
			};
			if (pending.length > 0 && this.#deps.supervisor) try {
				const exits = await this.#deps.supervisor.reload(pending);
				const tasks$1 = exits.filter((exit) => !this.#deps.pool.has(exit.address)).map((exit) => ({
					exitId: exit.address,
					kind: "subscription-smoke",
					run: async () => {
						const verdict = await admitTrusted(this.#deps, {
							address: exit.address,
							protocol: exit.protocol,
							source: "subscription"
						});
						if (verdict.admitted && verdict.node) {
							if (this.#deps.pool.add(verdict.node)) {
								this.#deps.pool.markOk(verdict.node.id);
								this.#state.convertedAdmitted += 1;
								const served = exit.node;
								this.#state.pendingConversion = this.#state.pendingConversion.filter((node) => node !== served);
							}
						}
					}
				}));
				if (tasks$1.length > 0) await this.#deps.prober.enqueueAll(tasks$1);
				this.#logger?.info(`opencode2dsh: sing-box converted ${exits.length} encrypted node(s); ${this.#state.convertedAdmitted} admitted`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				this.#state.lastError = message;
				this.#logger?.warn(`opencode2dsh: sing-box conversion failed: ${message}`);
			}
			const tasks = plaintext.filter((candidate) => !this.#deps.pool.has(candidate.address)).map((candidate) => ({
				exitId: candidate.address,
				kind: "subscription-smoke",
				run: async () => {
					const verdict = await admitTrusted(this.#deps, {
						address: candidate.address,
						protocol: candidate.protocol,
						source: "subscription"
					});
					if (verdict.admitted && verdict.node) {
						if (this.#deps.pool.add(verdict.node)) {
							this.#deps.pool.markOk(verdict.node.id);
							this.#state.plaintextAdmitted += 1;
						}
					}
				}
			}));
			if (tasks.length > 0) await this.#deps.prober.enqueueAll(tasks);
			return this.state;
		} finally {
			this.#running = false;
		}
	}
	async #fetch(url) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
		try {
			const response = await (this.#deps.fetchImpl ?? fetch)(url, {
				signal: controller.signal,
				headers: {
					accept: "*/*",
					"user-agent": "clash-verge/1.6.0"
				}
			});
			if (!response.ok) throw new Error(`subscription HTTP ${response.status}`);
			return await response.text();
		} finally {
			clearTimeout(timer);
		}
	}
	/** Subscriptions embed account credentials; never log them in full. */
	#redact(url) {
		if (url.length <= 24) return url;
		return url.slice(0, 12) + "…" + url.slice(-6);
	}
};

//#endregion
//#region src/ip-pool.ts
/** Data dir shared with the catalog cache (config.ts convention). */
function dataDir() {
	return join(homedir(), ".opencode2dsh");
}
/** Parse one manual proxy string into an exit id + protocol, or null. */
function parseManualProxy(entry) {
	const trimmed = entry.trim();
	if (trimmed === "") return null;
	const schemeMatch = /^([a-z0-9+.-]+):\/\//i.exec(trimmed);
	const scheme = schemeMatch?.[1]?.toLowerCase();
	const rest = schemeMatch ? trimmed.slice(schemeMatch[0].length) : trimmed;
	if (!/^\[[^\]]+\]|[^:]+:\d{1,5}$/.test(rest)) return null;
	if (scheme !== void 0 && scheme !== "http" && scheme !== "socks5" && scheme !== "https" && scheme !== "socks4" && scheme !== "socks5h") return null;
	return {
		id: trimmed,
		protocol: scheme === "socks5" || scheme === "socks4" || scheme === "socks5h" ? "socks5" : "http"
	};
}
/** Build the ExitPool from config (manual proxies + pinned). The pool starts
*  with unknown health; the periodic/probe layer (IP-2) fills it in. Pinned
*  nodes are admitted even without admission data — the user vouches for
*  them (docs/ip-pool.md 3.1/4.5). */
function buildPoolFromConfig(config) {
	const pool = new ExitPool();
	const ipPool = config.ipPool ?? {};
	for (const entry of ipPool.manual ?? []) {
		const parsed = parseManualProxy(entry);
		if (!parsed) continue;
		const node = {
			id: parsed.id,
			protocol: parsed.protocol,
			source: "manual",
			pinned: false,
			exitIP: "",
			exitLocation: "",
			latencyMs: 0,
			quality: gradeOf(0),
			addedAt: Date.now()
		};
		pool.add(node);
		pool.markOk(node.id);
	}
	const pinned = ipPool.pinnedExitId?.trim();
	if (pinned) {
		const parsed = parseManualProxy(pinned);
		if (parsed) {
			const node = {
				id: parsed.id,
				protocol: parsed.protocol,
				source: "manual",
				pinned: true,
				exitIP: "",
				exitLocation: "",
				latencyMs: 0,
				quality: gradeOf(0),
				addedAt: Date.now()
			};
			pool.add(node);
			pool.markOk(node.id);
			pool.pin(node.id);
		}
	}
	return pool;
}
/**
* Assemble the routing stack. Returns null (with a logged reason) when the
* host has no undici or the pool ends up empty — enabled-but-empty must
* degrade to today's direct behavior, never a broken dispatcher (3.3).
*
* The undici seam is imported once here and threaded to every layer; empty
* pool does not stop the runtime from existing (reconfigure can add exits
* later), it only keeps the dispatcher uninstalled.
*/
async function startIpPool(config, logger) {
	const ipPool = config.ipPool ?? {};
	const pool = buildPoolFromConfig(config);
	let undici;
	try {
		undici = await import("undici");
	} catch (err) {
		logger.warn(`opencode2dsh: undici unavailable; exit routing disabled (${err instanceof Error ? err.message : String(err)})`);
		return null;
	}
	const { RoutingInstaller } = await import("./installer-BTPLVxWM.js");
	const installer = new RoutingInstaller({
		pool,
		undici,
		proxyHosts: ipPool.proxyHosts,
		logger
	});
	const admissionDeps = {
		pool,
		undici,
		logger,
		blockedCountries: ipPool.free?.blockedCountries,
		smokeModel: (ipPool.probeModels ?? [])[0]
	};
	const probeModels = ipPool.probeModels ?? [];
	const prober = new Prober({
		pool,
		maxConcurrentProbes: ipPool.maxConcurrentProbes ?? 3
	});
	let refill = null;
	let subscriptions = null;
	let supervisor;
	const ensureSupervisor = () => {
		const singboxPath = config.ipPool?.singbox?.path;
		if (typeof singboxPath !== "string" || singboxPath.length === 0) return void 0;
		if (supervisor === void 0) supervisor = new SingBoxSupervisor({
			binPath: singboxPath,
			dataDir: join(dataDir(), "singbox"),
			logger
		});
		else supervisor.setBinPath(singboxPath);
		return supervisor;
	};
	const ensureSubscriptions = (urls) => {
		if (urls.length === 0) return null;
		if (subscriptions === null) subscriptions = new SubscriptionFetcher({
			...admissionDeps,
			prober,
			supervisor: ensureSupervisor()
		}, { logger });
		subscriptions.setUrls(urls);
		return subscriptions;
	};
	/** Apply the config to the live objects (initial start + reconfigure). */
	const applyConfig = () => {
		const current = config.ipPool ?? {};
		pool.setTargetSize(current.free?.targetSize ?? 20);
		admissionDeps.blockedCountries = current.free?.blockedCountries;
		admissionDeps.smokeModel = probeModels[0];
		prober.setMaxConcurrent(current.maxConcurrentProbes ?? 3);
		installer.setProxyHosts?.(current.proxyHosts);
		const wantRefill = (current.free?.enabled ?? true) && current.enabled !== false;
		if (wantRefill && refill === null) {
			refill = new RefillScheduler(pool, {
				...admissionDeps,
				prober
			});
			refill.onAdmitted(() => {
				if (!installer.enabled && current.enabled !== false && pool.snapshot().total > 0) {
					installer.install();
					if (installer.enabled) logger.info("opencode2dsh: first free exits admitted — exit routing engaged");
				}
			});
			refill.start();
		} else if (!wantRefill && refill !== null) {
			refill.stop();
			refill = null;
		}
		const fetcher = ensureSubscriptions(current.subscriptions ?? []);
		if (fetcher !== null) {
			fetcher.setIntervalMs(current.subscription?.refreshMs ?? 30 * 6e4);
			if (fetcher === subscriptions && !fetcherActive) {
				fetcher.start();
				fetcherActive = true;
			}
		}
	};
	let fetcherActive = false;
	if (pool.snapshot().total > 0) installer.install();
	else logger.warn("opencode2dsh: ipPool enabled but no exits configured; staying direct until settings add exits");
	applyConfig();
	const probeAll = async () => {
		const models = probeModels.length > 0 ? probeModels : ["big-pickle"];
		const { admitCandidate: admitCandidate$1, admitTrusted: admitTrusted$1 } = await import("./admission-Bb5NuLaW.js");
		const tasks = pool.list().map((entry) => ({
			exitId: entry.id,
			kind: "probe-all",
			run: async () => {
				for (const model of models) {
					admissionDeps.smokeModel = model;
					const verdict = entry.source === "free" ? await admitCandidate$1(admissionDeps, {
						address: entry.id,
						protocol: entry.protocol,
						source: "free"
					}) : await admitTrusted$1(admissionDeps, {
						address: entry.id,
						protocol: entry.protocol,
						source: entry.source === "manual" ? "manual" : "subscription"
					}, {
						pinned: entry.pinned,
						previous: {
							exitIP: entry.exitIP,
							exitLocation: entry.exitLocation,
							latencyMs: entry.latencyMs,
							quality: entry.quality
						}
					});
					if (verdict.admitted && verdict.node) {
						pool.add({
							...entry,
							...verdict.node,
							pinned: entry.pinned
						});
						if (verdict.limited) pool.markLimited(entry.id);
						else pool.markOk(entry.id, model);
					} else {
						pool.markDeadStrike(entry.id);
						break;
					}
				}
			}
		}));
		if (tasks.length === 0) return 0;
		prober.enqueueAll(tasks).catch(() => {});
		return tasks.length;
	};
	const probeExitTask = (exitId, entry) => ({
		exitId,
		kind: "probe-exit",
		run: async () => {
			const models = probeModels.length > 0 ? [...probeModels] : ["big-pickle"];
			const { admitCandidate: admitCandidate$1, admitTrusted: admitTrusted$1 } = await import("./admission-Bb5NuLaW.js");
			for (const model of models) {
				admissionDeps.smokeModel = model;
				const verdict = entry.source === "free" ? await admitCandidate$1(admissionDeps, {
					address: entry.id,
					protocol: entry.protocol,
					source: "free"
				}) : await admitTrusted$1(admissionDeps, {
					address: entry.id,
					protocol: entry.protocol,
					source: entry.source === "manual" ? "manual" : "subscription"
				}, {
					pinned: entry.pinned,
					previous: {
						exitIP: entry.exitIP,
						exitLocation: entry.exitLocation,
						latencyMs: entry.latencyMs,
						quality: entry.quality
					}
				});
				if (verdict.admitted && verdict.node) {
					pool.add({
						...entry,
						...verdict.node,
						pinned: entry.pinned
					});
					if (verdict.limited) pool.markLimited(entry.id);
					else pool.markOk(entry.id, model);
				} else {
					pool.markDeadStrike(entry.id);
					break;
				}
			}
		}
	});
	const probeExit = async (exitId) => {
		const entry = pool.list().find((node) => node.id === exitId);
		if (!entry) return 0;
		await prober.enqueue(probeExitTask(exitId, entry));
		return 1;
	};
	setRotateDelegate(createRotateDelegate(pool, { maxAttempts: config.ipPool?.maxRotateAttempts ?? 3 }));
	return {
		pool,
		installer,
		prober,
		get subscriptions() {
			return subscriptions;
		},
		get refill() {
			return refill;
		},
		async reconfigure(next) {
			const wasEnabled = config.ipPool?.enabled !== false;
			config.ipPool = next.ipPool;
			probeModels.length = 0;
			probeModels.push(...next.ipPool?.probeModels ?? []);
			const enable = next.ipPool?.enabled !== false;
			applyConfig();
			setRotateDelegate(createRotateDelegate(pool, { maxAttempts: next.ipPool?.maxRotateAttempts ?? 3 }));
			if (enable && !installer.enabled && pool.snapshot().total > 0) {
				installer.install();
				if (installer.enabled) logger.info("opencode2dsh: exit routing recovered — global dispatcher is free again (R1)");
			} else if (!enable && installer.enabled) installer.disable();
			if (wasEnabled !== enable) logger.info(`opencode2dsh: ip pool ${enable ? "enabled" : "disabled"} via settings (live)`);
		},
		probeAll,
		probeExit,
		async refillNow() {
			if (refill !== null) await refill.tick();
		},
		async refreshSubscriptions() {
			await subscriptions?.refreshNow();
		},
		async dispose() {
			setRotateDelegate(null);
			subscriptions?.stop();
			refill?.stop();
			installer.dispose();
		}
	};
}

//#endregion
export { buildPoolFromConfig, parseManualProxy, startIpPool };