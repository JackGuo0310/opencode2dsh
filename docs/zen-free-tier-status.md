# Zen 免费通道状态（非官方客户端）

**结论（2026-10-15 22:40 复核）：匿名免费通道可用。** 门禁在 10-15 白天之后又换了一层校验面：路径仍在 `/inference/v1`，但**请求头与工具声明都要对**——`x-opencode-session-id` 必发、`x-opencode-request` 必不发、`x-opencode-project` 必须是 40 位小写 hex（或字面量 `global`），并且 `tools` 里必须带**真 schema 的内置 `read`**。

> 时间线：10-15 16:38 的 v1.2.2 结论（换到 `/inference/v1` + 停发 `x-opencode-request` + bash/read 桩工具）在当晚 22:00 已不成立：同一份桩工具（`parameters: { type: 'object', properties: {} }`）现在一律 403。以下为 22:30–22:40 的逐项消融实测，均已随 v1.2.3 修入适配器。

## 当前有效规则（逐项消融实测）

请求面：`POST https://opencode.ai/inference/v1/chat/completions`（官方 Console 配置用的是 `/inference/openai/v1`，两者都通），`Authorization: Bearer public`（字面量，不是 key）。

| 变量 | 结果 |
| --- | --- |
| 基线：真 `read` schema + `x-opencode-session-id` + 无 `x-opencode-request` + project 40 hex | **200**（正常流式返回） |
| 去掉 `x-opencode-session-id` | 403 |
| 加回 `x-opencode-request`（`msg_` 或 `prt_` 形式都一样） | 403 |
| `x-opencode-project` = `prj_<24hex>`（旧适配器的形状） | 403 |
| `x-opencode-project` = `global` / 任意 40 位 hex | 200（取值无关，**形状**有关） |
| `tools` 只有 `read` 且 `properties` 非空 + `required: ['filePath']` | 200 |
| `tools` 里的 `read` 是空 schema（`properties: {}`） | 403 |
| `tools` 只有 `bash`（真 schema）、没有 `read` | 403 |
| `tools` = 真 `read` + 真 `bash`/`glob`/`grep`/`edit` | 200 |
| `tools` = 真 `read` + **桩 `bash`**（空 schema） | 403 |
| `tools` = 真 `read` + 空 schema 的 `webfetch`/`foo`/`todowrite` | 200（未知名字不校验） |
| `stream: false`，或省略 `stream` | 403 |

要点：**门禁认的是"内置 `read` 的真实声明"**，不是"有 read 这个名字"；同时**任何叫 `bash` 的桩声明都是毒药**（旧实现注入的正是 bash+read 双桩，所以 403）。其余未知工具名带空 schema 无所谓。

`GET /inference/v1/models` 匿名 200，目录不受门禁影响。

## 复现步骤

1. `node test/live-capture.mts` —— 打印适配器真正发出的头与 body，并跑一轮真实对话；修好后应输出 `result: kind=stop text="OK"`。
2. 手测基线：`POST https://opencode.ai/inference/v1/chat/completions`，头 `authorization: Bearer public`、`x-opencode-client: cli`、`x-opencode-session/-session-id/-affinity/X-Session-Id`（同值）、`x-opencode-project: <40hex>`，**不带** `x-opencode-request`；body `stream: true` + 真 `read` schema。
3. 对照：把 `x-opencode-project` 换成 `prj_…`、去掉 `x-opencode-session-id`、或把 `read` 换成空 schema，都应得 `403 FreeTierError`。

## 与官方客户端的关系

- 同机官方 CLI（v2.0.29）始终能用免费模型（实测 `TEST_OK`）；官方后台服务 `POST /api/session/{id}/generate` 也 200，而只带一个随机 session 头的 `POST /api/experimental/generate` 复现 403 —— 与上表的头部/工具规则一致。
- 官方 Console 配置（`GET https://opencode.ai/console/api/v2/config`，`Authorization: Bearer oc_sk_…`）给出 `opencode` provider：`baseURL=https://opencode.ai/inference/openai/v1`、`apiKey={env:OPENCODE_CONSOLE_TOKEN}`、头 `x-opencode-org-id: wrk_…`；`opencode-go` provider 走 `/inference/go/v1`。匿名通道不需要 console token。
- 付费路径不受影响：`deepseek-v4.1-flash` 带 key 打 `/zen/v1` 仍 200。

## 与参考实现的关系

- [zhuweiyou/oc2api](https://github.com/zhuweiyou/oc2api) 2.7.x（2026-10-15 04:23 UTC）结论一致：只保留内置 `read`、必须带真实参数 schema。
- [apmantza/pi-free #614](https://github.com/apmantza/pi-free/pull/614)（2026-10-15 14:10 UTC）方向一致（迁 `/inference/v1`），但它主张 `x-opencode-request` 必须发且用 `msg_` 前缀；**本机 22:35 消融不成立**：同一 body 下不发该头 200、发 `msg_` 形式 403。
- [6Kmfi6HP/opencode2api](https://github.com/6Kmfi6HP/opencode2api) 最新仍是 10-15 05:40 UTC 的路径迁移，未跟进 22:00 之后的收紧。
