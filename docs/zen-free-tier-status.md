# Zen 免费通道状态（非官方客户端）

**结论（2026-10-15 复核）：匿名免费通道可用。** 2026-10-11 起上游把免费层从 `/zen/v1` 迁到 V2 的 `/inference/v1`，本插件的免 key 匿名路径在换路径、并停发一个头之后恢复。

> 本文在 v1.2.1 之后曾记录「免费层只认官方登记会话、非官方客户端无解」。那个结论是错的：免费层没有关闭，只是换了路由。当时的消融矩阵恰好全程带着 `x-opencode-request`（见下），把门禁的真实变量误判成了会话登记。以下为 2026-10-15 重测结果。

## 当前有效规则（逐项消融实测）

请求面：`POST https://opencode.ai/inference/v1/chat/completions`，`Authorization: Bearer public`（字面量，不是 key）。

| 变量 | 结果 |
| --- | --- |
| 基线：`/inference/v1` + 合法 descending session + 无 `x-opencode-request` | **200**（正常流式返回） |
| 同请求改打 `/zen/v1` | 403 |
| **加回 `x-opencode-request`** | **403** |
| `x-opencode-project` = `global` / 40 位 hex / 完全不发 | 均 200（**取值无关**） |
| UA 用旧的 `opencode/1.18.31 ai-sdk/provider-utils/… runtime/bun/…` | 200（**形状不校验**） |
| 完全不带 session 头 | 403 |
| `stream: false`，或省略 `stream` | 403 |
| `tools` 只含 `bash`，或只含未知工具名（`foo`） | 403 |
| `tools` 含 `read` / `edit` / `glob` / `grep` 任一 | 200（未知工具名可共存） |

- `GET /inference/v1/models` 匿名 200，目录与 `/zen/v1/models` 相同（模型目录两侧都不设门禁）。
- 连发 10 次匿名请求 10/10 成功，未观察到限流。
- 仍未验证：`/inference/v1/responses`（`space-bunny-free` 报 `ModelProtocolUnsupported`，属模型协议限制而非门禁）、`/inference/v1/messages`。

## 三个真实变量

1. **路径**：必须 `/inference/v1`。`/zen/v1` 对匿名一律 403。
2. **`x-opencode-request` 必须不发**：它的存在本身就是拒绝条件，与取值无关。
3. **body 形状**：必须 `stream: true`，且 tools 里至少有一个文件类工具（`read`/`edit`/`glob`/`grep`）。只发 `bash` 不够——这与 2026-09-18 记录的「agent-shape」是同一层校验。

session 头仍然必须有，且必须是 `ses_<12 hex><14 base62>`、时间段为 descending 编码（v1.2.0 的修复依旧有效）。

## 与参考实现的关系

- [6Kmfi6HP/opencode2api 0924584](https://github.com/6Kmfi6HP/opencode2api/commit/0924584b0f9413f5408a82f39f964f9e6b8ea24e)（2026-10-15）方向正确：迁到 `/inference/v1`、停发 `x-opencode-request`。本仓库采用同样的两个变量。
- 该提交另外两条不成立：「`x-opencode-project` 必须为 `global`」（实测取值无关，40 位 hex 与不发送均 200）、「UA/版本下限必须对齐 v2 2.0.29」（实测旧 UA 200）。照抄无害，但不必需。
- [jasonxu114514/opencode2api](https://github.com/jasonxu114514/opencode2api) 10-14 起只有监控/用量类提交，未跟进路径迁移。

## 复现步骤

1. 生成合法 session：`ses_` + 12 位小写 hex（48 位 `~(ts_ms*4096+counter)` 的反码）+ 14 位 Base62。
2. `GET https://opencode.ai/inference/v1/models`，带 `authorization: Bearer public`、`x-opencode-client: cli`、`x-opencode-project: global`，应得 200（>80 个 id）。
3. `POST https://opencode.ai/inference/v1/chat/completions`，body 为 `stream: true` + 至少一个文件类工具桩，headers 带 `x-opencode-session`，**不带** `x-opencode-request`，应得 200 流式响应。
4. 对照：同一步把路径换回 `/zen/v1`，或加回 `x-opencode-request`，应得 `403 FreeTierError`。
