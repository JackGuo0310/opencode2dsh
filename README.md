<div align="center">

# opencode2dsh

**Free OpenCode Zen models, natively inside DSH (DeepSeek Harness).**

No API key. No registration. No extra process.

[![npm](https://img.shields.io/npm/v/@opencode2dsh%2Fdsh-plugin)](https://www.npmjs.com/package/@jackguo0310/opencode2dsh)
[![license](https://img.shields.io/npm/l/@opencode2dsh%2Fdsh-plugin)](https://github.com/JackGuo0310/opencode2dsh/blob/master/LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-blue)](https://github.com/JackGuo0310/opencode2dsh)

English | [简体中文](README.zh-CN.md)

</div>

---

opencode2dsh registers a native DSH `LlmAdapter` that streams directly from
[OpenCode Zen](https://opencode.ai/zen)'s **anonymous free lane** — the same
models OpenCode's own CLI uses without an account, served to your DSH model
picker as a regular provider called `opencode2dsh`.

Requests leave your machine looking exactly like traffic from the OpenCode
CLI (same user agent, same correlation headers), and the model catalog stays
fresh through a three-tier fallback chain. There is nothing to log into and
nothing to host.

## Highlights

> **Scope note (v1.1.0).** This project currently focuses on bringing
> OpenCode Zen's free models into DSH: model catalog, chat, thinking-level
> picker, and image input. The IP-pool / exit-routing functionality
> (`src/ip-pool.ts`, `src/pool/`, the settings card) is **retained in the
> repository but paused — it is no longer enabled by default and is not
> actively maintained**, pending either the host's new settings transport or
> a community contributor picking it up. Free-lane access does not require
> the IP pool: anonymous requests go direct, and the previous
> free-pool-only behavior only engages when a user explicitly opts in via
> config.

- **Zero credential, zero setup** — the anonymous lane needs no key; install, restart, chat
- **Native adapter, no sidecar** — one npm package, no child process, no binary, no local port (the legacy Go sidecar is not part of the published package; see `legacy/`)
- **CLI-identical disguise** — requests carry the OpenCode CLI user agent and its session/request/project header set, derived per conversation
- **Selectable thinking levels** — reasoning-capable free models expose an effort picker in DSH's model selector (declared ladders where the model metadata provides them, Off/Minimal/Low/Medium/High otherwise); Off leaves `reasoning_effort` unset — the upstream retired the `none` value — so the model runs at whatever effort the provider defaults to, and no selection behaves the same way
- **Vision where the model has it** — free models that declare image input (Space Bunny, kimi-k2.5-free, minimax-m3-free, …) advertise `image` and receive real image bytes; the rest stay honestly text-only
- **Live catalog with a fallback chain** — live upstream list ∩ free-by-metadata, falling back to offline cache and a verified static list
- **Self-healing** — fast startup retries, periodic refresh, and a written health snapshot for diagnostics
- **Proper error surfaces** — upstream failures (rate limit, auth, timeout, transport) arrive in DSH as classified finish reasons, and retries stay owned by DSH

## Install

**From the plugin market** (recommended, once this repo is listed there):
in DSH open **Settings → Plugin Market**, search `opencode2dsh`, one-click
install.

**From npm**:

```sh
dsh plugin --profile web add github:JackGuo0310/opencode2dsh#v1.1.0
```

**From source** (build the tarball yourself):

```sh
git clone https://github.com/JackGuo0310/opencode2dsh.git
cd opencode2dsh
pnpm install && pnpm pack
dsh plugin --profile web add ./jackguo0310-opencode2dsh-<version>.tgz
```

**Verify**: restart `dsh web`, open the model picker, and pick a model from
the **opencode2dsh** group.

Requires DSH (DeepSeek Harness) with a web profile; Node.js ≥ 20 (already
present if DSH runs); outbound HTTPS to `opencode.ai` and `models.dev`.

> **Compatibility — DSH `0.2.1-alpha.1` (0.1.x is no longer supported).**
> Model routing, chat, thinking levels and image input all work: the
> `LlmAdapter` contract, `registerAdapter`, the modality vocabulary, the
> attachment service, the settings seam, `cordis`'s context API and the
> web-frontend platform module table are unchanged in 0.2.
>
> **The IP-pool settings card does not appear on 0.2.1.** The host removed both
> pieces it depends on — the `settingsScope` client service and the
> `settings.plugin.item` slot (renamed `settings.plugins.tab`) — so the card
> degrades to absent. This is a missing card, not a failure: the plugin's
> client half still activates, and model routing is untouched. Porting the card
> needs the new settings transport and is tracked as separate work.

## Configuration

Defaults work out of the box. Override via the profile's `cordis.patch.yml`:

```yaml
- id: opencode2dsh
  name: '@jackguo0310/opencode2dsh'
  config:
    mode: adapter        # adapter (default) | sidecar
    providerId: opencode2dsh
    refreshSeconds: 300  # catalog refresh cadence
```

| Option | Default | Description |
| --- | --- | --- |
| `mode` | `adapter` | `adapter`: native LlmAdapter streaming straight from Zen. `sidecar`: legacy local-agent mode, not bundled — build the agent from `legacy/agent` and pass `agentPath`. |
| `providerId` | `opencode2dsh` | Provider name shown in DSH. |
| `refreshSeconds` | `300` | Live catalog refresh interval. Pricing metadata refreshes every 24 h. |
| `maxRequestImageBytes` | `20971520` (20 MiB) | Base64 bound across one request's retained images. Exceeding it fails with the host's `IMAGE_OFFLOAD_REQUIRED` code so `dsh-compaction-image-offload` drops the oldest images and retries. |
| `requestImagePixelBudget` | `4194304` (2048²) | Total-pixel budget per image; larger sources are downscaled proportionally. |
| `requestImageMaxBytes` | `1048576` (1 MiB) | Encoded-byte target per image before base64 expansion. |
| `maxRequestImages` | `32` | Image occurrences one request may carry. |
| `agentPath` | auto-resolved | Sidecar only: path to the agent binary. |
| `agentArgs` | — | Sidecar only: extra CLI args for the agent. |
| `restartDelayMs` / `restartMaxDelayMs` / `maxConsecutiveCrashes` | `1000` / `60000` / `5` | Sidecar only: restart backoff and circuit breaker. |

## Image input

Models whose models.dev metadata declares `image` input advertise it in DSH's
model picker and receive **real image bytes** — each attachment is resolved
through the host's durable attachment service, sent as `image_url` data URIs
beside a short handle text that names the file and its read-only normalized
path. Free models currently on that path include `space-bunny-free`,
`kimi-k2.5-free`, `minimax-m3-free`, `mimo-v2.6-flash-free` and
`qwen3.6-plus-free`; every other free model stays honestly text-only.

**Video, PDF and audio are not supported.** Some free models declare those
modalities upstream, but the DSH host carries exactly one binary modality
(raster image) and projects every file attachment to handle text for all
routes, so no adapter can deliver them. Rather than advertise a capability the
harness cannot transport, the catalog reports only `text` and `image`. Attach
a video or PDF and the model still receives its path and can read it with a
tool.

Requires the host's `attachments` service (`dsh-attachment`); without it, an
image turn fails with `UNSUPPORTED_CONTENT` instead of silently dropping what
you attached.

> **Verified live (2026-09-24).** `space-bunny-free` accepts image input over
> the full plugin path — `ZenAdapter → attachment service → pi-ai → fetch →
> Zen` — answering correctly from the pixels at every size tried (4×4 through
> 320×240). Malformed image bytes are still rejected upstream with
> `400 invalid_request_error`, so an image turn that 400s usually means corrupt
> bytes, not an unsupported model.

## How it works

```
DSH session
   │  harness chunks (block-start / text-delta / usage / finish …)
   ▼
ZenAdapter (registered LlmAdapter)
   │  pi-ai openai-completions stream (chat models)
   │  pi-ai openai-responses stream (`muse-spark-*`, Responses-only on Zen)
   ▼
https://opencode.ai/zen/v1        ← Authorization: Bearer public
   with CLI-identical headers:
     user-agent: opencode/…
     x-opencode-client, x-opencode-session, x-session-affinity,
     X-Session-Id, x-opencode-request, x-opencode-project
```

- **Session correlation** — session/project ids are SHA-256 derived from the
  conversation's first user turn (stable per conversation, non-reversible),
  and each request gets a fresh random id, mirroring the CLI.
- **Catalog fallback chain** — S1: live `GET /v1/models`; S2: models.dev
  pricing metadata decides "free" and supplies limits, reasoning ladders and
  input modalities; S3: a compile-time verified static list.
  A disk cache (~7-day TTL) covers upstream outages.
- **Resilience** — the adapter registers immediately at startup; if the first
  catalog fetch races your network (VPN/TUN reconnects, DNS), the plugin
  retries on a short cadence (~1 min) before settling into the periodic
  refresh.
- **Sidecar mode** (`mode: sidecar`, legacy) — spawns a local Go agent (a
  single-tenant port of [opencode2api](https://github.com/jasonxu114514/opencode2api))
  on `127.0.0.1:<random>`, token-authenticated, and registers a standard
  `llm-pi-ai` route. **Not part of the published package**; build it from
  `legacy/agent` (`go build ./cmd/agent`) and point `agentPath` at the binary.

## Health & troubleshooting

The plugin writes a health snapshot after every refresh round:

```
~/.opencode2dsh/adapter-status.json
```

```json
{
  "status": "ready",
  "total": 64,
  "exposed": 9,
  "lastError": "",
  "writtenAt": "2026-08-29T07:01:54.915Z"
}
```

| Symptom | Likely cause & fix |
| --- | --- |
| Boot screen shows `Failed to load plugins … list slot "settings.plugin.item" requires options.id` | Your DSH is too old (≤ 0.1.0-rc.6): the settings-slot contract predates the plugin 0.3.0 browser half. Upgrade DSH to ≥ 0.1.0-rc.7 (latest recommended). Plugin ≥ 0.3.1 registers in either slot shape, so on old DSH you lose at most the settings card — model routing is unaffected. |
| Only 3 models | Startup fetch raced your network; retries land within ~1 min. Check `adapter-status.json` for `lastError`. |
| `lastError: "fetch failed"` persisting | Outbound HTTPS to `opencode.ai` blocked; check proxy/VPN rules. |
| Rate-limit errors in chat | The anonymous lane is quota-per-IP; switch network node or wait. |
| Connection error to `127.0.0.1:*` | A stale sidecar route shadows the adapter; plugin ≥ 0.2.1 removes it at startup. |
| Install fails with `ERR_PNPM_IGNORED_BUILDS` | A transitive dependency of `pi-ai` (`@google/genai`, `protobufjs`) has build scripts that are not needed at runtime. Approve-or-decline them via the plugin market, or set both to `false` under `allowBuilds:` in the profile's `pnpm-workspace.yaml`. |

## Security

- No secrets involved: the anonymous lane's key is the literal string `public`; nothing is stored, nothing telemetry.
- Install paths restricted to `lib/` only; no build scripts run from dependencies.
- All requests go directly from your machine to `opencode.ai` / `models.dev`.

## Development

```sh
git clone https://github.com/JackGuo0310/opencode2dsh.git
cd opencode2dsh
pnpm install
pnpm typecheck && pnpm test   # 44 unit tests
pnpm build                    # bundle to lib/
```

The legacy Go sidecar lives in `legacy/agent` (`go test ./...`). Architecture
notes and the porting record live in `docs/`.

Releasing: `pnpm pack` (prepack builds the host and client bundles).

## Acknowledgments

- [**opencode2api**](https://github.com/jasonxu114514/opencode2api) by
  [@jasonxu114514](https://github.com/jasonxu114514) — the legacy Go sidecar
  in `legacy/agent` is a port of its anonymous-lane implementation, and the
  catalog fallback chain and request-disguise details are derived from it.
  This project stands on its shoulders.
- [OpenCode](https://opencode.ai) — for running the free anonymous Zen lane.
- [@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) — the wire layer used by adapter mode.
- [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) and the
  [dsh-market](https://github.com/dsh-market/dsh-market) community.

## Friends

<div align="center">

**[LinuxDo](https://linux.do)** — 新的理想型社区 / a new ideal community

</div>

## License

[MIT](./LICENSE) © FishBottle7
