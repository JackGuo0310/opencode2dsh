# Changelog

## 1.1.0 (2026-10-04)

**适配 DSH `0.2.1-alpha.1`（不再支持 0.1.x）。模型路由、对话、思考等级、图片输入全部正常；IP 池设置卡在新宿主上不显示。**

### Changed

- `peerDependencies` 从 `>=0.1.7-rc.1 <0.1.8` 改为 `>=0.2.1-alpha.1 <0.3`。
  0.1.x 与 0.2.x 的 peer 范围不重叠，装错版本会直接报不匹配。

### 核对结论（逐项对 0.2.1-alpha.1 实机安装包核实，非推测）

宿主半边**全部不变**，无需改代码：

| 插件依赖 | 0.2.1 状态 |
| --- | --- |
| `LlmAdapter` 七个方法（含 `imageRequestPricing`） | 一致 |
| `registerAdapter(providers, adapter)` | 一致；只校验 `providerInfo` / `providerRetryPolicy`，**无 `instanceof` 检查**，普通对象照常可注册 |
| `await adapter.listModels()` | 宿主用 `await`，同步返回数组仍然可用 |
| `ModelModalityMap` / `inputModalities` | 一致 |
| 附件服务 `readImageRequest` / `imageHostPath` | 一致 |
| `cordis` `Context.get` / `effect` / `inject` | 一致（`context.d.ts` 逐字节相同） |
| `cordis.patch.yml` 的 `insert` 处理 | 一致（`applyPatches` 实现相同） |
| web 前端平台模块表 | 一致（4 个 seed 名字未变） |

0.2 的破坏性变更在**分发形态**：`@deepseek-ai/dsh` 从「打包 282 个子包」改为
「核心 83 个 + profile 独立发包」；`dsh-llm` / `dsh-attachment` / `dsh-llm-pi-ai`
等仍在，改由 profile 依赖。

### Fixed

- **`dsh.client.inject` 填的是服务名，应为包名。** 该字段是客户端模块图的加载顺序
  列表，取**包名**（DSH 自带插件的manifest 均如此），而不是 cordis 服务名。原值
  `['slots','locale','settingsScope']` 会被 `dsh-client-modules` 在模块图里查不到后
  **静默跳过**——是一段看起来有用、实则无害的空操作。服务注入由
  `src/client/index.ts` 导出的 `inject` 负责，那里本来就是对的
  （`['slots','locale']`，settingsScope 已按 0.1.7-alpha 的教训放在嵌套 inject 里）。
  现改为三个真实包名。
- 版本一致性测试在 HEAD 未打 tag 时崩掉（`git describe --exact-match` 会以非零退出
  而非输出空行），现改为捕获后跳过。

### 已知问题：IP 池设置卡在 0.2.1 不显示

宿主移除了卡片依赖的两样东西，**两者在 0.2.1 里都已确认不存在**：

- 客户端 `settingsScope` 服务（全宿主搜索无匹配）
- `settings.plugin.item` 槽位（改名为 `settings.plugins.tab`）

卡片因此降级为「不显示」。**这只缺一张卡片，不是故障**：客户端半边仍会激活
（模块级 `inject = ['slots','locale']` 两个服务都在，`ctx.locale.register` 签名未变），
嵌套的 `settingsScope` inject 永不被满足，回调不执行，也就不会碰到已移除的
`slots.inject('settings.plugin.item', …)`。模型路由完全不受影响。

移植该卡片需要接入 0.2 的新设置通道（`settings.plugins.tab` 槽位形状已探明：
`{ name, id, order, label, locale, inject }`，由 `settings.section` 的 `children`
声明），属于单独的待办，不在本版范围内。

## 1.0.9 (2026-09-24)

**新增：免费模型的图片能力真正打通了。此前所有模型都被硬编码为纯文本，DSH 会在派发前把图片剥离，Space Bunny 这类多模态免费模型的看图能力完全用不上。**

> **实测确认（2026-09-24）：Zen 免费通道支持 `space-bunny-free` 的图片输入。**
> 走完整的 `ZenAdapter → 附件服务 → pi-ai → fetch → Zen` 链路实测通过：模型正确
> 读出合成图的左右两色。4×4 至 320×240 各尺寸均 200。
>
> 排查记录：早先一轮探测曾得出「上游拒绝一切图片」的结论，那是**测试数据本身
> 损坏**造成的误判——手写的 base64 PNG 其 IDAT 长度字段解出 1073741824 字节，
> 上游拒绝的是坏图片。换用合法 PNG 后立即 200；`data:text/plain` 这类非图片
> 载荷仍会被正确拒绝。教训：探测用的样本必须自校验结构，别拿手写字节串当基准。

### Added

- **目录如实上报输入模态。** catalog 解析 models.dev 的
  `modalities.input` 与 `attachment`，`listModels` / `resolveModel` 按模型
  回报真实 `inputModalities`，pi-ai wire model 的 `input` 同步放开
  （pi-ai 自己就用这个字段决定是否序列化图片）。
  - 声明了 `image` 的免费模型（space-bunny-free、kimi-k2.5-free、
    minimax-m3-free、mimo-v2.6-flash-free 等）在 DSH 里现在可以看图。
  - 元数据缺失或 id 不存在时**保持纯文本**：少报会在图片挂载前就拒绝，
    多报会让上游在消息已落库后才报错。
- **图片走真实字节。** `src/adapter/images.ts` 是 dsh-llm 请求图表面
  （几何预算、base64 记账、offload 算术、占位文本）的独立实现，保留一份
  副本以便宿主包缺失时插件仍可导入。适配器通过 `ctx.attachments` 惰性解析
  请求版本字节（服务晚于注册挂载也能恢复），每张图发出「句柄文本 + 真实
  图片」，pi-ai 转成 `image_url` data URI。纯文本会话序列化结果与之前
  逐字节一致。
- **工具返回的图片同样可传。** 图片块会在工具结果里递归收集，字节读取、
  请求预算、offload 判定三处口径一致。
- **请求图预算可配。** `maxRequestImageBytes`（默认 20MiB，base64 口径）、
  `requestImagePixelBudget`（默认 2048×2048）、`requestImageMaxBytes`
  （默认 1MiB）、`maxRequestImages`（默认 32）。超限时抛宿主
  `IMAGE_OFFLOAD_REQUIRED` 失败码，由 `dsh-compaction-image-offload`
  卸载最旧图片后重试，而不是插件自行丢弃。
- **附件服务缺失时明确报错。** 路由声明了 image 能力却没有附件服务时，
  回合以 `UNSUPPORTED_CONTENT` 失败，不静默吞掉用户附的图。

### Fixed

- **选思考等级 Off 不再 400。** 上游已弃用 `reasoning_effort: "none"`
  （2026-09-24 实测：`none` 与 `off` 都是 `400 invalid_request_error`，而
  `minimal|low|medium|high|xhigh|max` 全部 200），而插件仍在发送 `none`，
  导致自 1.0.7 起选 Off 的每个回合都失败。
  - `off` 现在不注入该字段（`reasoningEffortWire('off') === undefined`），
    即「不指定档位」，模型按上游默认档位运行。
  - 兜底：若上游 400 且点名了这个字段，适配器丢弃该字段重发一次
    （`effortWireIsRefusable`），回合照常完成。401/403/429 属出口/通道问题，
    不走这条路——换 IP 也修不好 schema 错误，那仍由轮换循环负责。
  - 失败信息里会说明「已丢弃上游拒绝的 reasoning_effort 并重试」。

### 视频 / PDF / 音频：明确不支持

models.dev 上部分免费模型确实声明了 `video`、`pdf`、`audio`
（muse-spark-1.3-contributor-free、mimo-v2-omni-free 等），但 DSH 宿主
只有 `ImageBlock` 一种二进制模态，`FileBlock` 在 `dsh-llm` 核心里对**所有**
路由无条件投影成文本句柄，适配器无法绕过。catalog 因此只放行
`text` / `image`——如实上报宿主能投递的模态，而不是让用户在模型选择器里
看到一个点了就会失败的选项。视频/PDF/音频附件仍会以只读路径句柄交给模型
自行读取。

## 1.0.2 (2026-09-23)

**修复:客户端半边不再在模块级依赖 `settingsScope`,避免 DSH 0.1.7-alpha 上启动失败。**

DSH 0.1.7-alpha 移除了 `settingsScope` 服务;旧代码在 browser half 的
模块级 `inject` 里声明了它,cordis 因而一直 "waiting for service:
settingsScope",导致整个插件 bundle 不激活、启动页报
`Failed to load plugins ... did not activate`。

现在改为嵌套 `inject(['settingsScope'], ...)`(同 dshmarket 的做法):
宿主提供该服务时才挂 IP 池设置卡;不提供时仅缺少卡片,**模型路由/调用完全不受影响**。

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
