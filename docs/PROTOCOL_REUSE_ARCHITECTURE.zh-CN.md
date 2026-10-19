# ADR-001：Playground 协议复用与清晰分层架构

> 运行形态与图片模型白名单已经在 [ADR-002](DUAL_DEPLOYMENT_GPT_IMAGE_25.zh-CN.md) 中收敛：Standalone 可部署独立 BFF、Embedded 使用 NewAPI 登录态 Token ID；仅支持 Flare 和 Sunburst 两款图片模型。


状态：**已完成代码调查和技术选型；尚未实施真实调用。** 日期：2026-10-18。目标同时支持图片与文本的 Chat Completions / Responses 协议（以及独立 Images API 兼容模式），当前浏览器本地存图不变，R2/作品保留策略只保留远期规划。

## 1. 决策摘要

**优先复用已有 NewAPI Relay / relayconvert / Playground SSE / 前端组件，而不是叠加第二套协议网关。**

按优先级：
1. **NewAPI 已有代码**：聊天、Responses 转发/互转、图片 Relay、账户权限、渠道、用量结算、流式解析。
2. **现有依赖**：`sse.js` 用于当前 Playground 的客户端 SSE；`ai`（现有 v7）、`motion`、`zod`、`@tanstack/react-query`、现有 ai-elements 与 `use-stick-to-bottom` 在需要时复用；独立工程已有 `react-konva`。
3. **第三方库候选**：`@ai-sdk/react` / Vercel AI SDK UI、官方 `openai` JS SDK、`@ai-sdk/openai`、`@ai-sdk/openai-compatible`；只在满足本系统消息流合同并显著减少代码时采用。
4. **必须自写的薄层**：产品任务模型（intent）、能力矩阵、选择策略、供应商专有 Chat 图片解析、资产归一、本地会话上下文，以及从登录态网页安全访问现有 Relay 的 API 路由。

**不要做的事情**：新建一套 Node/Next.js 转发服务；将管理 Key 写到 `VITE_*` 或客户端；把标准 Chat 视觉理解错认成图片输出；在已发送可能计费的请求后自动换协议重试；为不同协议复制整套 React 聊天 UI。

## 2. 已核验的仓库事实

### NewAPI Go 后端 (Vsonic12138/new-api)
- `router/relay-router.go` 已有 `POST /v1/chat/completions`（TokenAuth）、`POST /pg/chat/completions`（UserAuth + Distribute）。
- `router/task-plugin-protocol-router.go` 注册了 `openai_responses.create` / `openai_image.generate` / `openai_image.edit` 的 TokenAuth 路由，并回落现有 Relay。外部协议端点已有，但**站点登录态 Playground 还没有同等的完整图文路由**。
- `relay/channel/openai/chat_via_responses.go`：Responses → Chat 格式转换，包含流式处理。
- `relay/channel/openai/responses_via_chat.go`：Chat → Responses 格式转换，包含流式处理。
- `relay/channel/openai/relay_responses.go`：原生 Responses 结果与流式、调用计数和用量。
- `relay/channel/openai/relay_image.go`：图片生成/编辑响应、图片数量、用量、图像流式事件。
- `relaykit/relayconvert/` 与 `service.ConvertRequest/ConvertResponse/ConvertStreamResponseChunk`：现有统一转换入口。**应做语义验证而不是重写**。
- `controller/playground.go`：把登录用户关联到临时 token 和原有计费链路。当前仅面向 Chat，扩展时不要简单换 `RelayFormat` 而不测权限、multipart 和工具计费。
- `go.mod` 已包含 `github.com/openai/openai-go v1.12.0`，Go `1.26`；该依赖存在不代表可以替代 NewAPI 的 Relay/账单层，**暂不升级、不新增另一套 SDK**。

### NewAPI React 前端
- `web/package.json` 已有 `ai@^7`、`sse.js@^2.8`、`motion`、`zod`、`@tanstack/react-query`、`use-stick-to-bottom`，和现有 AI Elements 组件。
- `web/src/features/playground/hooks/use-stream-request.ts` 基于 `sse.js` 提供请求、关闭、错误状态；`use-chat-handler.ts` 管理文本增量合并、节流、终止/错误，均可扩展。
- `web/src/features/playground/api.ts` 已复用站点 `@/lib/api`，模型列表走已授权的 `/api/user/models`，避免复制 API Client。
- `web/src/features/playground/constants.ts` 当前 `CHAT_COMPLETIONS` 指向 `/pg/chat/completions`。Chat Hook 的解析逻辑不是 Responses SSE 的通用解析器，不能不经测试直接复用。

### 独立生图仓库
- `src/api/client.ts` 当前 Mock + **本地开发** `/relay/v1/images/*`，不是生产方案。
- `src/lib/image-store.ts` IndexedDB、`src/lib/conversations.ts` localStorage。
- `src/components/EditorModal.tsx` react-konva 标注及编辑器，图片版本通过 `parentId` 关联。
- `vite.config.ts` 的测试 Token 注入仅在 loopback Vite dev server 生效；GitHub Pages 发布环境是 Mock、不可调用真实付费模型。

## 3. 轮子选择矩阵（✅采用 / 🟡评估 / ❌不采用）

| 候选 | 擅长 | 本项目取舍 |
| --- | --- | --- |
| 现有 NewAPI Relay/relayconvert | 协议转换、模型渠道路由、stream、用量结算 | ✅ **后端唯一协议/计费底座** |
| 现有 Playground SSE Hook + sse.js | 同源浏览器 SSE、停止/增量状态 | ✅ **先扩展为协议无关的 stream transport**；每协议 event parser 分离 |
| NewAPI `ai`、AI Elements、motion 等 | UI 组件、图文消息呈现、交互 | ✅ **复用已有 React 依赖和组件** |
| Vercel `@ai-sdk/react useChat` | 消息生命周期、流式增量、工具交互 | 🟡 只有 BFF 输出兼容 AI SDK UIMessage Stream，或编写/验证 Custom Transport 才采用；**不能将 OpenAI SSE 直接作为 useChat 默认数据流** |
| `@ai-sdk/openai` | Node/TS 服务端同时调用 OpenAI Chat / Responses、工具 | 🟡 若独立 TypeScript BFF 将来确有必要才用；目前 NewAPI 后端是 Go，新增 Node 会形成重复协议和鉴权链 |
| `@ai-sdk/openai-compatible` | 一般 Chat 兼容模型，流式/供应商扩展 | 🟡 只适用对应供应商实现的能力；不能自动保证 Responses 图片工具与非标 Chat 图像输出 |
| 官方 `openai` JS SDK | 标准 OpenAI API 类型、请求、流式 | 🟡 合适服务端 Node 测试工具，不建议在用户浏览器持有管理员 token 直接调用 |
| 已安装 `openai-go v1.12.0` | 官方 Go OpenAI API 调用 | 🟡 可作为后端某些辅助类型参考，暂不变更当前 Relay 处理 |
| 自建 SSE JSON 解析框架 | 完全可控 | ❌ 不与现有 sse.js / NewAPI SSE 并存一个重复全新框架 |
| 自建第二计费/模型通道路由 | 自由度高 | ❌ 与 NewAPI 额度/权限冲突，不做 |

第三方 API 对照（应在实施时核对实际安装版本）：
- https://ai-sdk.dev/providers/ai-sdk-providers/openai
- https://ai-sdk.dev/providers/openai-compatible-providers
- https://ai-sdk.dev/docs/ai-sdk-ui/transport
- https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- https://github.com/openai/openai-node/blob/main/docs/configuration.md
- https://github.com/openai/openai-go

## 4. 最终架构（以 NewAPI 作为唯一后端）

```text
web/src/features/image-playground/     << 新 UI 模块（或渐进合并旧 Playground）
  ├─ components/                     对话、图片卡片、预览、编辑、进度
  ├─ state/                          图文消息、版本关系、协议首选项
  ├─ storage/                        IndexedDB Blob + localStorage 元信息
  ├─ application/
  │   ├─ coordinator.ts              意图、命令、状态机、取消、错误
  │   ├─ capability-selector.ts      能力驱动选协议；纯逻辑、可测试
  │   └─ context-builder.ts          Chat/Responses 历史及参考图选择
  ├─ transport/
  │   ├─ api-client.ts               复用 '@/lib/api' (session + CSRF)
  │   ├─ stream-client.ts            复用/抽取现有 sse.js hook
  │   └─ parsers/                    仅解析 UI 所需差异，无模型渠道路由逻辑
  │       ├─ chat-events.ts
  │       ├─ responses-events.ts
  │       └─ vendor-chat-image.ts    仅 whitelist 扩展
  └─ contracts/                      request/result/capability & types
                │
                ▼
NewAPI Gin 同源 /pg/* + /api/playground/capabilities
  ├─ 现有 Session / UserAuth / CSRF
  ├─ 现有分组、模型授权、渠道/限流/额度
  ├─ **很薄的新增图文 Playground 入口**
  │   └─ 请求整形/白名单，不负责重复计费
  └─ 现有 Relay / relaykit / relayconvert
      ├─ Chat ↔ Responses
      ├─ 原生 Responses image_generation call
      ├─ Images API generation/edit
      └─ 供应商渠道适配 + usage settlement
                │
                ▼
上游 API (模型/协议由管理员能力表验证)
                │
                ▼
统一 UI Message/Asset → 本地 IndexedDB/localStorage
```

**不要引入第二个后端服务**。正式 NewAPI 前端可与独立 Playground 共享类型和展示组件，但通信/认证必须在 NewAPI 应用里复用 `@/lib/api`。当前独立 Vite 仓库只用于 UI 验证，不等于生产安全调用地址。

## 5. 职责边界（防止未来越改越乱）

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| View | 输入/渲染/标注/提示/用户手动选择 | API 格式、Secret、计费 |
| Application | 命令与状态机、请求取消、历史、协议 preflight 决策 | 向上游直连、重算 token 费用 |
| Browser Transport | 统一发起同源请求、管理 SSE 生命周期和取消 | 账号权限、渠道重试和费率 |
| NewAPI BFF | 登录态用户上下文、能力策略/参数检查、限制、与现有 Relay 对接 | 重实现完整 OpenAI 协议 / 第二套 billing |
| NewAPI Relay | Chat/Responses/Images 格式转化、供应商路由、用量 | 用户 UI 本地作品管理 |
| Local Storage | 当前设备图片/会话/版本引用 | 伪装成云作品集或跨账号同步 |

**清晰的唯一事实来源**：
- 用户授权、模型/渠道配置、实际是否允许协议：**NewAPI 后端**
- 前端选中协议与创作意图：**应用状态**
- 图片二进制与版本：**当前浏览器 IndexedDB**
- 当前请求是否已计费：**NewAPI usage/log**，前端只展示真实结果，不凭中断或超时判定退款。

## 6. 最小新增与保留

### 必须新写（薄）
1. `capability-selector`：意图 `text_chat | image_qa | image_generate | image_edit`，允许 `chat | responses | images`，只读管理员已验证模板。
2. `vendor-chat-image` 解析器：仅针对明确登记、能用测试样例证明图片输出的 Chat 兼容渠道，不把图片理解误判成生成。
3. `responses-image` 输出适配：解析 `output[].type=image_generation_call` 与文本、工具调用，保存 `response_id`，后续同源/同渠道且有效时延续。
4. `/pg/responses` 与 `/pg/images/*` 登录态路由（需测试和适配多部分上传），不重复建立结算入口；`/api/playground/capabilities`。
5. 结果/错误统一类型，便于 UI 展示 `unsupported` / `rate_limited` / `transport_failed` / `billing_unknown`。

### 应复用（不重写）
1. 旧 `/pg/chat/completions` 和原有 NewAPI `controller.Playground` 的登录上下文、分组/额度链。
2. `service.ConvertRequest/ConvertResponse/ConvertStreamResponseChunk` 和 `relay/channel/openai/{chat_via_responses,responses_via_chat,relay_responses,relay_image}.go`。
3. 当前 `use-stream-request` 的流终止/取消与无效代次屏蔽，在新的协议事件 Adapter 上封装。
4. 现有 `web/src/components/ai-elements`、Toast、表单、视觉骨架屏、会话渲染模块，不直接从外部复制整套 Chat UI。
5. 独立版 `EditorModal`（react-konva）及本地图片存储，以适配组件方式整合 NewAPI。

## 7. 关键不兼容边界（需要专门测试）

**协议转换不代表完整能力等价**：
- `Chat ↔ Responses` 的现有转换支持文本与常规工具的情况，不能由文件名推断已完整支持 `image_generation` 二进制、图片输入、推理参数与所有供应商扩展。
- Response ID 可能是转换层生成的标识。必须确认对应上游是否真实支持 `previous_response_id`，不能将转换后的 ID 当成有状态游标无限续聊。
- Responses 工具内 `image_generation.model` **未必沿用顶层 `model` 的 NewAPI 渠道映射**，需要单独核验 image tool 名称/权限及成本归属。
- NewAPI 当前已统计 Responses 的 image generation call，但 *streaming 的实际图片 partial events*、图片内容保存成功、用户看到的结果数量仍需端到端检验。
- 因为 Chat 图像输出非标准，供应商返回 `choices[].message.images`、多模态 part 或自定义 JSON 都应每家单独测试，拒绝未知结构。
- Chat / Responses 都不能默认跨模型或跨渠道继承上下文；手动协议切换时在前端提示，并将必要图片作为新的请求载荷附上。
- 不能在上游超时后自动尝试第二个模型/协议，以免重复收费；只有请求*尚未发送*可预检回退。

## 8. 测试与上线门槛（现阶段不发起付费调用）

| 项目 | 最低验收条件 |
| --- | --- |
| NewAPI Relay 回归 | Chat 和 Responses 文本、流式、usage、finish/error、工具调用不退化 |
| 图片 Responses | image_generation_call Base64/完成事件、图像输入、多轮编辑、费用计数 |
| Chat 图片供应商 | 实际渠道专用格式的协议契约单测 + 独立人工计费 smoke test |
| 浏览器 SSE | 取消、失败、重复 chunk、断线、超时、长响应、错误码 |
| 鉴权与计费 | 跨账号/跨组/不允许模型拒绝、无重复扣费、不泄漏 Key |
| 本地存储 | Blob 保存失败提示、跨浏览器不互通说明、版本关系 |
| 页面复用 | NewAPI UI 复用依赖不重复引入，保持国际化和移动端适配 |

## 9. 推进顺序与技术债

- **P0：独立接口契约和测试样例**：静态 Chat/Responses/Images/供应商 Chat 图像响应 fixture；不得先重构整个 UI。
- **P1：在 NewAPI 中加安全的登录态协议路由 + Capability**，验证依然走同一条计费链。该阶段为真实模式必要前置。
- **P2：复用现有 Stream Hook 扩展两类文本协议**，Image QA 的参考图需经过鉴权/大小限制。
- **P3：图片 Responses / Images**，先非流式正确持久化，再按真实事件做分片。
- **P4：按供应商 Chat 图片适配**，不实现未经验证的“万能图片提取”。
- **P5：性能与 UX**：图像历史、编辑预览、降级提示、请求费用风险，单测+端到端回归。
- 将来的云作品集/清理机制单独作为独立模块，不污染协议 transport 和 NewAPI Relay。

## 10. 外部许可证与升级策略

- NewAPI 上游和复用代码受其 AGPL 约束；保留原版权说明。独立 demo 的代码可以按组件接口重用到 NewAPI，但不能盲目把 AGPL 源文件复制进一个不遵循该许可的独立仓库。
- 使用现有依赖优于新增一套协议/状态管理包。只有验证 **SDK 支持当前版本、新API 兼容格式、可打包体积、安全审查、许可** 时才增加新依赖。
- `ai@7` 已存在并不代表本仓库 Playground 已用 `useChat`：目前它用的是 `sse.js`。若要迁移到 AI SDK UI，必须额外证明可兼容其 UI Message Stream 或自定义 Transport，并给出比现有 SSE Hook 更低的总维护成本。
- 禁止把主密钥、上游明文地址、供应商请求头或用户敏感内容写入客户端日志。
