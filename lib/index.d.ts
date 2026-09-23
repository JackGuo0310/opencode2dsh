import { EventEmitter } from "node:events";

//#region src/agent-process.d.ts

/**
 * Drives the agent child process (design.md section 8.1-8.2):
 * spawn with piped stdio, READY-line handshake for the random port,
 * exponential-backoff restart on unexpected exit (1s -> 60s, circuit breaker
 * after N consecutive crashes), and graceful stop (SIGTERM -> 5s -> SIGKILL;
 * Windows uses taskkill /T because signals are not deliverable there).
 */
interface ReadyInfo {
  port: number;
  version: string;
}
type AgentState = 'starting' | 'ready' | 'stopped' | 'tripped';
declare class AgentProcess extends EventEmitter {
  #private;
  private child;
  private state;
  private consecutiveCrashes;
  private restartTimer;
  private stopping;
  private disposed;
  private backoffMs;
  private readySinceMs;
  private readonly agentPath;
  private readonly args;
  private readonly options;
  constructor(agentPath: string, args: string[], options: {
    restartDelayMs: number;
    restartMaxDelayMs: number;
    maxConsecutiveCrashes: number;
    onLog?: (line: string) => void;
  });
  getState(): AgentState;
  get readyInfo(): ReadyInfo | null;
  /** Spawn the agent and resolve with the READY handshake result. */
  start(readyTimeoutMs?: number): Promise<ReadyInfo>;
  /** Read stdout until the READY line (design.md section 8.2). */
  private readReadyLine;
  private pipeLogs;
  private onExit;
  private detach;
  /** Graceful stop: terminate, wait, then force-kill the whole tree. */
  stop(): Promise<void>;
  /** Idempotent teardown: no more restarts after dispose. */
  dispose(): Promise<void>;
  private terminate;
  private killTree;
  private taskkill;
  private setState;
}
//#endregion
//#region src/config.d.ts
/**
 * Plugin configuration (cordis config object, injected via cordis.patch.yml).
 */
interface Opencode2dshConfig {
  /**
   * Integration mode. `adapter` (default) registers a DSH LlmAdapter that
   * streams directly from the Zen anonymous lane — no child process. `sidecar`
   * (legacy, not bundled with the published package) spawns the Go agent
   * binary and registers an llm-pi-ai route to it; build the agent from
   * legacy/agent and pass agentPath.
   */
  mode?: 'adapter' | 'sidecar';
  /** Path to the agent binary (sidecar mode). Not bundled: build from legacy/agent. */
  agentPath?: string;
  /** Extra CLI args forwarded to the agent (after --config). */
  agentArgs?: string[];
  /** Provider route name registered into llm-pi-ai settings. */
  providerId?: string;
  /** Credential reference (env var name) holding the local agent token. */
  apiKeyEnv?: string;
  /** Model list refresh interval in seconds (agent refresh_seconds matches). */
  refreshSeconds?: number;
  /** Restart backoff: initial delay ms. */
  restartDelayMs?: number;
  /** Restart backoff: max delay ms. */
  restartMaxDelayMs?: number;
  /** Consecutive crash count that trips the circuit breaker. */
  maxConsecutiveCrashes?: number;
  /**
   * IP-pool exit routing (docs/ip-pool.md). Everything below is pure plugin
   * config; the settings page (IP-6) will own these live, this object is
   * the cordis.patch.yml seam.
   */
  ipPool?: IpPoolConfig;
}
/** docs/ip-pool.md section 5.1 schema (subset owned by config today). */
interface IpPoolConfig {
  /** Master switch; false keeps the process exactly as today (direct). */
  enabled?: boolean;
  /** Manually added plain proxies: 'http://h:p' or 'socks5://h:p'. */
  manual?: string[];
  /** Fixed primary exit address (docs/ip-pool.md 3.6). */
  pinnedExitId?: string;
  /** Absolute pinning: never rotate, never direct-fallback (3.6). */
  pinnedStrict?: boolean;
  /** Hosts whose traffic goes through the pool (default opencode.ai). */
  proxyHosts?: string[];
  /** Free-source pool (docs/ip-pool.md 1.2 source 1, 3.5, 4.5). */
  free?: {
    enabled?: boolean;
    /** Target capacity for the free pool (docs 3.5). */
    targetSize?: number;
    /** Admission geo blocklist (country codes). */
    blockedCountries?: string[];
  };
  /** Airport/Clash subscriptions (docs 1.2 source 3, IP-3). */
  subscriptions?: string[];
  /** Subscription refresh interval ms (docs 4.6, default 30min). */
  subscription?: {
    refreshMs?: number;
  };
  /** Cross-exit probe concurrency cap (docs 4.1; same-exit always serial). */
  maxConcurrentProbes?: number;
  /** sing-box conversion core for encrypted nodes (docs 1.2.2, IP-4). */
  singbox?: {
    /** sing-box binary: PATH name or absolute path; unset parks encrypted
     *  nodes as pending-conversion. */
    path?: string;
  };
  /** Admission smoke model (docs 4.1 probeModels[0]). */
  probeModels?: string[];
  /** Same-request rotate attempts on pre-content failures (docs 3.4). */
  maxRotateAttempts?: number;
}
type ResolvedConfig = Required<Pick<Opencode2dshConfig, 'providerId' | 'apiKeyEnv' | 'refreshSeconds' | 'restartDelayMs' | 'restartMaxDelayMs' | 'maxConsecutiveCrashes'>> & Opencode2dshConfig;
declare function resolveConfig(config?: Opencode2dshConfig): ResolvedConfig;
/**
 * Everything the plugin persists next to the agent: the generated
 * agent-config.json (design.md section 8.3 template) and the local auth token.
 * The data directory doubles as the models.dev cache location for the agent.
 */
interface AgentConfigPaths {
  dataDir: string;
  configPath: string;
  tokenPath: string;
}
declare function configPaths(dataDir: string): AgentConfigPaths;
/**
 * Read the persisted token or generate and persist a fresh one.
 * Best-effort 0600 on POSIX; Windows profile dirs are user-scoped already.
 */
declare function ensureToken(paths: AgentConfigPaths): Promise<string>;
/**
 * Write agent-config.json atomically (tmp + rename) every plugin start, so a
 * version upgrade or option change reaches the next agent spawn. The agent
 * accepts JSON with comments; we emit plain JSON.
 */
declare function writeAgentConfig(paths: AgentConfigPaths, options: {
  token: string;
  refreshSeconds: number;
}): Promise<void>;
//#endregion
//#region src/provider.d.ts
interface PiAiModelEntry {
  id: string;
  name: string;
}
interface ProviderTarget {
  providerId: string;
  apiKeyEnv: string;
  port: number;
}
declare function providerBaseURL(port: number): string;
/** Minimal settings/credentials seam so tests can run against fakes. */
interface DshSeams {
  credentials: {
    set(ref: string, value: string): Promise<void>;
  };
  settings: {
    get(ns: string): unknown;
    mutate(ns: string, ops: Array<{
      op: 'set' | 'unset';
      path: Array<string | number>;
      value?: unknown;
    }>): Promise<void>;
  };
  logger: {
    info(message: string): void;
    warn(message: string): void;
  };
}
/** Parse the agent's OpenAI-shaped /v1/models reply into pi-ai model entries. */
declare function toPiAiModels(data: unknown): PiAiModelEntry[];
declare function fetchModels(port: number, token: string, timeoutMs?: number): Promise<PiAiModelEntry[]>;
/** GET /healthz (no auth); throws on transport failure or non-2xx. */
declare function fetchHealth(port: number, timeoutMs?: number): Promise<unknown>;
/**
 * Ensure the credential and the llm-pi-ai provider route reflect the running
 * agent. Safe to call repeatedly (every refresh): writes are no-ops when the
 * stored shape already matches, and mutate keeps other namespaces/routes
 * untouched because it edits only the opencode2dsh subtree.
 */
declare function registerProvider(seams: DshSeams, target: ProviderTarget, token: string, models: PiAiModelEntry[]): Promise<void>;
//#endregion
//#region src/index.d.ts
/**
 * opencode2dsh DSH cordis plugin entry.
 *
 * Two modes (config.mode, default `adapter`):
 *  - adapter: register a DSH LlmAdapter streaming directly from the Zen
 *    anonymous lane (marketplace shape: no child process, no binary).
 *  - sidecar (legacy/dev): prepare data dir + token + agent-config.json,
 *    spawn the Go agent, wait for READY, register the llm-pi-ai provider
 *    route, schedule model refresh.
 *
 * dispose(): stop timers/catalog, terminate the agent tree (sidecar mode).
 * The cordis fiber disposal guarantees this runs on plugin reload/unload and
 * on DSH shutdown.
 */
interface PluginContext {
  logger: {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  };
  llm?: {
    registerAdapter(providers: string[], adapter: unknown): unknown;
  };
  credentials?: {
    set(ref: string, value: string): Promise<void>;
  };
  settings?: {
    get(ns: string): unknown;
    mutate(ns: string, ops: Array<{
      op: 'set' | 'unset';
      path: Array<string | number>;
      value?: unknown;
    }>): Promise<void>;
    /** Full seam (rc.2): namespace registration + owner scope (docs §5.1). */
    register?(ns: unknown, schema: unknown, options?: {
      base?: unknown;
      applies?: 'live' | 'restart';
    }): {
      get(): unknown;
      watch(callback: (next: unknown, prev: unknown) => void | Promise<void>): () => void;
    };
  };
  /** Web route registration (dsh-host-webserver service, docs §5.3). */
  webServer?: {
    register(route: {
      kind: 'exact' | 'prefix';
      path: string;
      handler: (req: unknown, res: unknown) => void | Promise<void>;
    }): () => void;
  };
  /** cordis fiber injection: run the callback once every listed service is up. */
  inject?(services: string[], callback: (ctx: PluginContext) => void | Promise<void>): unknown;
  effect?(fn: () => () => void): unknown;
  on?(event: string, listener: (...args: never[]) => unknown): () => void;
}
declare const name = "opencode2dsh";
declare const inject: readonly ["llm", "credentials", "settings"];
declare function apply(ctx: PluginContext, config?: Opencode2dshConfig): {
  ready: Promise<ReadyInfo>;
};
/**
 * Locate the agent binary (sidecar mode, legacy — the published package does
 * not bundle it): explicit config wins; then a sibling `legacy/agent` dev
 * build; then a bare name on PATH.
 */
declare function defaultAgentPath(): string;
//#endregion
export { AgentProcess, type DshSeams, type Opencode2dshConfig, PluginContext, apply, configPaths, defaultAgentPath, ensureToken, fetchHealth, fetchModels, inject, name, providerBaseURL, registerProvider, resolveConfig, toPiAiModels, writeAgentConfig };