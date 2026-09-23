import { t as PoolRoutingDispatcher } from "./dispatcher-C9pQXvDo.js";

//#region src/pool/installer.ts
var RoutingInstaller = class {
	#deps;
	#previous = null;
	#current = null;
	#enabled = false;
	#deferredReason = null;
	/** The built-in fetch saved aside while the module fetch is installed (R2). */
	#savedGlobalFetch = null;
	constructor(deps) {
		this.#deps = deps;
	}
	get enabled() {
		return this.#enabled;
	}
	/** The deferral reason exposed to the status bridge / settings card. */
	get deferredReason() {
		return this.#deferredReason;
	}
	/** Live re-apply of the proxied-host list (forwards to the running router). */
	setProxyHosts(hosts) {
		this.#deps.proxyHosts = hosts;
		this.#current?.setProxyHosts(hosts);
	}
	/**
	* Decide whether installing is safe (docs/ip-pool.md R1 coexistence policy).
	* The global dispatcher slot is single-owner: if another dispatcher-level
	* plugin (dsh-llm-proxy etc.) already installed its own layer, installing
	* ours would short-circuit theirs silently. We defer instead — routing
	* stays off, the pool keeps assembling (exits/probes/settings all live),
	* and the reason surfaces on the settings card. Default Agent instances
	* (undici's own) are not treated as a foreign owner.
	*/
	#detectForeignDispatcher() {
		let current;
		try {
			current = this.#deps.undici.getGlobalDispatcher();
		} catch {
			return null;
		}
		if (current === null || current === void 0) return null;
		const name = current.constructor?.name ?? "";
		if (name === "" || name === "Object" || name === "Agent" || name === "Dispatcher") return null;
		if (current instanceof this.#deps.undici.Agent) return null;
		return `deferred: global dispatcher is owned by "${name}" — install dsh-llm-proxy or the IP pool in one profile only, not both (R1)`;
	}
	/** Install (or keep installed) the routing dispatcher. */
	install() {
		if (this.#enabled) return;
		const foreign = this.#detectForeignDispatcher();
		if (foreign !== null) {
			this.#deferredReason = foreign;
			this.#deps.logger?.warn(`opencode2dsh: exit routing ${foreign}`);
			return;
		}
		this.#deferredReason = null;
		const router = new PoolRoutingDispatcher({
			pool: this.#deps.pool,
			undici: this.#deps.undici,
			proxyHosts: this.#deps.proxyHosts,
			logger: this.#deps.logger
		});
		const previous = this.#deps.undici.setGlobalDispatcher(router);
		if (previous instanceof Object) this.#previous = previous;
		const old = this.#current;
		this.#current = router;
		this.#enabled = true;
		if (old !== null) old.destroy().catch(() => {});
		const moduleFetch = this.#deps.undici.fetch;
		if (typeof moduleFetch === "function" && globalThis.fetch !== moduleFetch) {
			this.#savedGlobalFetch = globalThis.fetch;
			globalThis.fetch = moduleFetch;
			this.#deps.logger?.info("opencode2dsh: globalThis.fetch -> undici module fetch (built-in fetch bypasses the pool dispatcher otherwise)");
		}
		this.#deps.logger?.info("opencode2dsh: global dispatcher -> PoolRoutingDispatcher (exit routing enabled)");
	}
	/** Restore the pre-install dispatcher and close ours. */
	disable() {
		if (!this.#enabled) return;
		this.#enabled = false;
		if (this.#savedGlobalFetch !== null) {
			globalThis.fetch = this.#savedGlobalFetch;
			this.#savedGlobalFetch = null;
		}
		if (this.#previous !== null) {
			try {
				this.#deps.undici.setGlobalDispatcher(this.#previous);
			} catch {}
			this.#previous = null;
		}
		const dying = this.#current;
		this.#current = null;
		if (dying !== null) dying.destroy().catch(() => {});
		this.#deps.logger?.info("opencode2dsh: exit routing disabled; previous global dispatcher restored");
	}
	/** Full teardown (plugin dispose): same as disable. */
	dispose() {
		this.disable();
	}
};

//#endregion
export { RoutingInstaller };