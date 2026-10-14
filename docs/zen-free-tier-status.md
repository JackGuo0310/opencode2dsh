# Zen 免费通道状态（非官方客户端）

**结论（截至 2026-10-14）：插件的"免 key 匿名免费模型"路径已失效。** 免费模型本身还在，但 Zen 免费闸门现在只认官方客户端产生并登记过的会话，任何非官方客户端（含本插件的全部伪装组合）一律 `403 FreeTierError`。

本文只记录事实与复现方法；上游一旦回退或有新解法，直接改这一篇。

## 实测（2026-10-14，本机，出口 IP 42.2.127.248 / HK）

请求：`POST https://opencode.ai/zen/v1/chat/completions`，`space-bunny-free`，`stream: true` + `bash/read/edit/glob/grep` 工具桩（2026-09-18 那套 agent-shape body），UA 覆盖 `opencode/1.18.31`、`1.18.34`、`2.0.0`、`2.5.0`、`omp/18.2.2`。

| `x-opencode-session` 来源 | 匿名 `Bearer public` | 带 `auth.json` 里的 `oc_sk_` key |
| --- | --- | --- |
| 当前实现（hash 位拼 descending 布局） | 403 | 403 |
| 真实 `Date.now()` + descending 布局，counter=1 | 403 | 403 |
| 同上，counter=0x800 | 403 | 403 |
| 同上，随机 14 位 Base62 尾串 | 403 | 403 |
| 不带 session 头 | 403 | 403 |

- `/zen/v1/chat/completions`、`/zen/v1/responses`、`/inference/openai/v1/chat/completions`、`/inference/openai/v1/responses` 四条路径结果一致，全部 403。
- `GET /zen/v1/models` 仍 200（85 个 id，目录未变，`big-pickle` 仍在，免费 id 含 `space-bunny-free`、`jev-1.13-free`、`cat-jam-free`、`mimo-v2.6-flash-free`、`nemotron-3.5-lightning-free`、`muse-spark-1.2/1.3-contributor-free` 等）。
- 关键判定变量不是 UA、不是时间戳编码、不是尾串、也不是 key：把任一项换成真实值都不改变 403。

## 对照：官方客户端同刻可用（说明不是账号/网络问题）

- 官方 CLI **v1.18.34**（`opencode-ai`）与 **v1.19.0**：同样 403，日志显示会话确实创建成功（`ses_ec4eff41fffe…`）仍被拒。
- 官方 CLI **v2.0.29**（`@opencode/cli`，2026-10-14 09:03 发布）：`opencode run --model opencode/space-bunny-free` 返回 `TEST_OK`。
- 上游仓库当天涌现同类报告（含 v2.0.29 用户）：[#55443](https://github.com/sst/opencode/issues/55443)、[#55435](https://github.com/sst/opencode/issues/55435)、[#55432](https://github.com/sst/opencode/issues/55432)、[#55426](https://github.com/sst/opencode/issues/55426)、[#55430](https://github.com/sst/opencode/issues/55430)。官方口径：v1 已停更，免费额度随 OpenCode 2 的 Console 通道维护。

## 闸门机制（社区 + 本次实测互相印证）

- 2026-09-16 起：session 形状校验（`ses_<12 hex><14 alnum>`）。
- 2026-10-13 起：形状之上再加 descending 时间编码校验 —— 即 v1.2.0 / v1.2.1 修的那一层。
- 2026-10-13 晚起（社区报告）／2026-10-14（本文实测）：**只认官方客户端走正规流程产生、并在上游登记过的会话 ID**；伪造 ID 无论形状多正确都 403。伪造解法见 [oh-my-pi#12306 的评论](https://github.com/can1357/oh-my-pi/issues/12306)：改为向本地 opencode 后台服务 `POST /api/session` 取真实会话。

## 参考实现动态

- [jasonxu114514/opencode2api](https://github.com/jasonxu114514/opencode2api)：最新补丁停在 2026-10-13 的 [PR #70 descending session 编码](https://github.com/jasonxu114514/opencode2api/pull/70)，即本仓库 v1.2.0 已包含的内容；之后无新提交。
- [6Kmfi6HP/opencode2api](https://github.com/6Kmfi6HP/opencode2api)：同日 `b0bcf960` 同样内容，之后只有 lint / e2e。
- 官方 sst/opencode 的 10-11～10-13 改动是 console 侧路由收敛：`83f2b6f6 make Zen routes a thin inference proxy`、`82833dac stop stripping legacy Zen headers in proxy`。

## 可行路径（均未实现）

1. **等上游回退**：免费额度曾经在 2026-09-16、09-18、10-13 三次收紧后部分放宽，本次也可能只是过渡期。几天后复查 `GET /zen/v1/models` + 一次 smoke 请求即可判断。
2. **改为依赖本机 opencode v2**：从它的常驻后台服务取真实会话，再从 `~/.local/share/opencode/auth.json` 读 key。代价是"免 key、免安装"两个卖点全部消失，且**未验证照抄 v2 的请求能否 200** —— 要验证需用本地明文 relay 抓 v2 的真实出站请求逐字段比对（[oh-my-pi#12306](https://github.com/can1357/oh-my-pi/issues/12306) 里的方法）。
3. **放弃匿名通道**：把插件定位改成"付费 Zen key / 其他 OpenAI 兼容后端的 DSH 适配器"，那基本等于另一个项目。

## 复现步骤

1. `GET https://opencode.ai/zen/v1/models` 带 `authorization: Bearer public`、`user-agent: opencode/<ver>`、`x-opencode-client: cli`，应得 200（>80 个 id）——用于确认只是聊天闸门拒绝。
2. `POST https://opencode.ai/zen/v1/chat/completions`，body 为 `stream: true` + 上面那组工具桩，headers 带 `x-opencode-session: ses_…`，观察是否 `403 FreeTierError`。
3. 对照：官方客户端 `opencode run --model opencode/space-bunny-free "Reply with exactly: TEST_OK"`；v2 应返回 `TEST_OK`，v1 返回同样的 403。
