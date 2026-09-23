# Changelog

## 1.0.1 (2026-09-23)

**仓库结构调整：插件包上提到仓库根，支持 git 依赖安装。**

原插件位于 `packages/plugin/`，pnpm 的 git 依赖只读仓库根 `package.json`，
导致 `dsh plugin add github:...#tag` 无法安装（会去根找不存在的 `packages/plugin`
而报错）。现将 `src/`、`test/`、`tsconfig.json`、`tsdown.client.config.ts`、
`pnpm-lock.yaml` 全部上提到根，根 `package.json` 即为 `@jackguo0310/opencode2dsh`
插件本体。

安装/升级改为与 `dsh-cost` 一致：

```
dsh plugin --profile web add github:JackGuo0310/opencode2dsh#v1.0.1
```

`prepare` 会在拉取后自动构建主机与客户端 bundle。

## 1.0.0 (2026-09-22)

从 FishBottle7/opencode2dsh fork 而来的自维护基线，版权归属切换至
JackGuo0310/opencode2dsh，版本从 1.0.0 开始独立计数（基于上游 0.3.3）。

### Added / Changed

- 上游 0.3.3 全部能力不变（匿名免费模型、CLI 同形伪装、三级目录回退链、IP 池）。
- **自维护加固**：`removeProviderRoute` 增加 `settings.get/mutate` 缺失守卫——
  DSH 0.1.7-alpha.1 起宿主不再提供该接口时跳过旧路由清理，避免启动警告
  （原为针对 npm 安装的实际 lib 补丁，现已固化进源码，升级不再丢失）。
- **仓库元数据**更新为 JackGuo0310/opencode2dsh（repository/homepage/bugs/author）。
- **支持 git 依赖安装**：新增 `prepare` 脚本，`dsh plugin add github:JackGuo0310/opencode2dsh#<tag>`
  时自动构建主机与客户端 bundle。

### 其他

- 早期提交（上下文窗口修复）见 PR #18：models.dev `limit.context/output` 接入
  `resolveModel` 与 pi-ai wire model，窗口如实上报、输出上限只降不升。

## 0.3.3 (2026-09-18)

### Added

- **带推理的免费模型现在可以选择思考等级。** 在 DSH 的模型选择器中，推理模型
  （big-pickle、mimo-v2.5-free、nemotron 系、muse-spark 系等）会出现思考等级
  选项：模型元数据声明了档位的按声明展示（如 muse-spark 的 Minimal–Xhigh），
  其余推理模型提供 Off/Minimal/Low/Medium/High。选 Off 会向上游发送
  `reasoning_effort: "none"`——实测这是唯一能真正让"常思考"模型停止思考的传法
  （只省略该字段时上游保持默认继续思考）；选具体档位原样透传；不选则请求与
  旧版完全一致。非推理模型不出现该选项。

## 0.3.2 (2026-09-18)

### Fixed

- **免费模型全线恢复：修复 2026-09-17 起所有免费源报 `403 FreeTierError`
  （"free tier can only be used from within OpenCode"）的问题。** 经逐项探针
  实测，上游匿名免费通道现在有两道校验，缺一即拒：其一，会话头必须匹配
  OpenCode 官方客户端的会话格式（原先任意 `ses_` 开头的串即可）；其二，请求体
  必须是"智能体形态"——流式且 `tools` 里同时包含名为 `bash` 与 `read` 的
  function 工具（描述与参数不查；纯聊天请求没有工具，故此前全部被拒）。
  插件现在把会话标识确定性映射成官方格式（同一对话仍映射到同一会话，会话
  亲和不受影响），并在发往上游的请求体缺失这两个工具时注入最小桩工具（纯
  聊天附带 `tool_choice: "none"`，模型不会真的调用它们）；免费源准入冒烟
  探测同步改为流式并携带桩工具。

## 0.3.1 (2026-09-11)

### Fixed

- **旧版 DSH 上插件加载失败的问题（用户反馈 `list slot "settings.plugin.item" requires options.id`）。**
  `settings.plugin.item` 槽位在 DSH 0.1.0-rc.7 起由 list（按 `id` 注册）改为 keyed
  （按 `key` 注册）；0.3.0 的设置页卡片按新版 keyed 形态注册，在旧版 DSH
  （≤ 0.1.0-rc.6）上会让整个插件加载失败、启动页报错。现在卡片注册前会探测宿主
  声明的槽位类型，按对应形态注册，两边都能用；即便宿主行为异常，注册失败也只
  跳过设置卡片（控制台警告提示升级 DSH），模型路由不再被拖垮。

## 0.3.0 (2026-09-09)

The release where the IP pool actually works.

### Fixed

- **模型流量现在真正经过 IP 池。** 此前 Node 内置 fetch 与插件所用 undici
  是两个隔离实例，池开启后模型请求仍然直连、路由从未生效。现在开启
  IP 池后模型流量会真实走池中出口。
- **卡死回合不会再挂住整个会话。** 请求遇到出口无响应时会在超时后
  自动换出口重试或如实报错，不再无限等待。
- **慢响应的正常请求不再被误判为坏出口。** 响应哨兵改为双窗口：
  连接阶段 2 秒严格判定死出口，隧道建立后等待响应头放宽到 10 秒，
  避免误杀慢首包的健康流。
- **上游 5xx 不再连带惩罚出口。** 模型自身报错（如权限不足的模型对
  所有人返回 500）不会再把出口标记为失效导致全部流量静默直连。
- **免费源准入恢复正常。** 上游现在要求会话伪装头，探测请求已同步
  补齐；此前免费源候选全部被误拒。
- **池首次攒到出口后自动启用路由**，无需再手动改一次设置来触发。

### Added

- **免费代理源从 26 个扩展到 48 个**，全部逐个实测可用后接入，每轮
  候选量约提升 75%。

## 0.2.7 (2026-09-05)

IP 池发布（IP-0 … IP-7）：出口池与两级健康度、粘性会话路由调度器、
订阅源（含 sing-box 加密节点转换）、设置页热更新、真实流量的被动健康
统计、全量粗筛、适配器层轮换重试、响应静默哨兵、探测模型下拉选择。

## 0.2.6

免费模型目录修复：元数据弃用优先于免费名回退；marketplace 条目指向
可安装的仓库根。
