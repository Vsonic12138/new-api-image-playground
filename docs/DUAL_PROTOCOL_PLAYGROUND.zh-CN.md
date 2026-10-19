# 双协议图文 Playground：设计与实施清单（2026-10）

> **落地约束更新：** 本方案受 [ADR-002 双部署与 GPT Image 2.5 限定](DUAL_DEPLOYMENT_GPT_IMAGE_25.zh-CN.md) 约束：生图/修图只允许 Flare/Sunburst 两款模型；LLM/VLM 文本和视觉理解模型没有这项限制，从用户有权使用的模型目录选择。Standalone 与 Embedded 共享核心，NewAPI 按用户自己的 Token ID/Group 验证权限。Responses 图片工具可用性须验证主 LLM 的工具能力，Chat 生图需实际供应商扩展支持。


> **架构决策更新：** 首先参考 [ADR-001：协议复用与清晰分层架构](PROTOCOL_REUSE_ARCHITECTURE.zh-CN.md)。NewAPI 已经包含 Chat ↔ Responses 转换、图片 Relay、SSE Hook 及相关第三方依赖，下面的模块列表是**抽象职责**，不是必须创建一套新的协议栈。正式集成必须复用既有 Relay / 计费和登录态。

> **状态：架构设计，不代表已经在 Pages 上完成真实模型调用。** GitHub Pages 当前仍是 Mock。浏览器 IndexedDB/LocalStorage 继续保存图片和会话；R2、站点作品集及保留期限仅保持在规划文档中。本文件不含上游凭证，也不触发付费 API。
>
> 设计目标：**对话和图片均有 Chat Completions、Responses 入口**；图片保留 Images API 作为独立第三协议的可选兼容项。协议可由管理员能力模板控制，并允许用户在已授权范围内手动选择，禁止凭模型名猜测能力。

## 0. 基本协议事实与兼容边界

官方 OpenAI 接口的分工：
- `/v1/chat/completions`：文本聊天与视觉图片输入/文本响应；**不存在通用标准的 Chat Completions 图片输出合同**。一些第三方提供商（例如某些兼容 Gemini 等的网关）会通过自定义 Chat 返回图片；该能力需要独立 `vendor_chat_image` 适配器，不能对所有 Chat 模型宣称支持生图。
- `/v1/responses`：文本对话、图片输入、`image_generation` 工具的生成与编辑。要区分顶层 `responsesModel`（支持工具调用的主模型）和工具内 `imageToolModel`；结果一般是 `output[]` 中的 `image_generation_call.result`（Base64），文字是 `message.content[].output_text`。根据可用性可维护 `previous_response_id`，但跨渠道/不保留服务端状态的中转不能假设它总有效。
- `/v1/images/generations` 和 `/v1/images/edits`：传统纯图片 API，供不支持 Responses 工具链的渠道明确选择，不能“悄悄”重试已扣费的请求。

参考：
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/tools-image-generation
- https://developers.openai.com/api/docs/guides/image-generation
- https://docs.newapi.pro/zh/docs/api/ai-model/chat/openai/createresponse

实际 NewAPI fork 已存在以下路由（检查：`router/relay-router.go` 与 `router/task-plugin-protocol-router.go`）：
- 令牌鉴权的 `POST /v1/chat/completions`
- 令牌鉴权、经协议插件或 Relay 处理的 `POST /v1/responses`
- 令牌鉴权的 `POST /v1/images/generations`、`/v1/images/edits`
- 面向站内登录态的 `POST /pg/chat/completions`，**尚未添加** `/pg/responses`、`/pg/images/*` 的专用 Playground 路由。

**不建议**为了上线，让公开 GitHub Pages 里的 JS 持有管理员 Key，也不建议无鉴权新建开放的反向代理。产品真实模式建议直接作为 NewAPI 同源页面部署，复用已登录用户 Session + 额度扣费流程。

## 1. 产品矩阵

| 用户操作 | Chat Completions | Responses | Images（可选兼容） |
| --- | --- | --- | --- |
| 文本聊天 | 原生文本模式（含 streaming） | 原生文本模式（含 streaming） | 不支持 |
| 附图问答 | vision `messages[].content[]` | `input_image` | 不支持 |
| 文生图 | **仅经过适配认证**的渠道专用多模态图片输出 | `tools: [{type:'image_generation', model:...}]` | `/images/generations` |
| 图片编辑 | **仅经过适配认证**的渠道专用多模态图片输出及图片输入 | 工具 `action:'edit'` + 图片上下文 | `/images/edits` |
| 多轮上下文 | 本地历史重放 + 原图/选定图像 | `previous_response_id` 有效时延续，否则显式历史与参考图 | 基于上一版图片逐次编辑 |

这里的四种产品组合仍然成立，但 **“Chat + 生图/修图”必须是渠道专有能力**，不能普适推断。UI 对未经过验证的渠道禁用相应选择，并解释原因。

## 2. 推荐设置与界面

不改变现有 ChatGPT 风格的对话界面，保留顶部精简模型展示，输入框区域增加两个可点击的 Chip：`类型：生图/修图/聊天`，`协议：自动/Chat/Responses`。需要时展开“高级设置”，才露出 Chat 模型、Responses 主模型、图片工具模型、尺寸、数量、质量、流式和渠道兼容性状态。

管理员预置经过验证的 **ModelCapabilityProfile**，不是按模型名前缀猜：
```ts
type Transport = 'chat' | 'responses' | 'images'
type Intent = 'text_chat' | 'image_qa' | 'image_generate' | 'image_edit'
type CapabilityStatus = 'verified' | 'unverified' | 'unsupported'
interface ModelCapabilityProfile {
  id: string
  displayName: string
  transport: Transport
  model: string
  intents: Partial<Record<Intent, CapabilityStatus>>
  stream: boolean
  imageInput: boolean
  imageOutput: boolean
  vendorAdapter?: string           // 如 third_party_chat_image_v1
  responsesImageToolModel?: string // 仅 Responses image 工具使用
  supportsPreviousResponseId?: boolean
  supportedSizes?: string[]
  supportedQualities?: string[]
}
type UserPreference = 'auto' | 'chat' | 'responses' | 'images'
```

**模型字段不要混淆**：
- `chatModel`：从中转已配置、当前用户可用的 **LLM/VLM** 中选择，支持普通对话和图像理解；Chat 图片输出需另外经验证的兼容扩展模型/能力模板。
- `responsesModel`：从中转已配置的 **LLM/VLM** 中选；纯文本 Responses 只需支持相应 Responses 协议，**只有 Responses 生图/修图才要求此主模型支持 `image_generation` 工具**。
- `imageToolModel`：Responses `image_generation` 工具的生图模型，只能是 `gpt-image-2.5-flare` 或 `gpt-image-2.5-sunburst`（或管理员验证映射的别名）；不是顶层主模型。
- `imagesModel`：直接 Images API 的图片模型，也只允许 Flare/Sunburst；可与工具模型分别选择。

预置应当由 NewAPI 管理员下发支持清单和默认值；用户可以在已验证且已授权的选项之间切换，默认不允许任意提供第三方 Base URL 或 token。

## 3. 自动协议选择（建议）

1. 用户选 `auto`：在当前帐号有权使用、已验证支持指定 `intent` 的模板集合里筛选。
2. 首选管理员指定默认模板；在当前意图不支持时选择另一个**预先验证**的模板（例如图像 Responses → Images），显示“将使用 XXX 协议/模型”。
3. 用户手动选 Chat / Responses 时为**严格指定**；不应擅自换成别的协议或模型。
4. **不在模型请求提交之后静默自动重试其它协议**。超时/断线/5xx 不能确定上游是否已产生费用；在重新调用前明确显示失败及重试的费用风险。仅在尚未向上游发出请求的本地预检阶段可以自动换计划。
5. 管理员“测试模型能力”需要明确标注可能付费，并由管理员单独确认；能力检测接口是对已验证配置的查询，不应在用户访问页面时主动发起付费探测。
6. 能力数据带来源、更新时间与协议版本，不因 UI 选择保存为已验证。

## 4. 三层实现结构

```text
React UI / Chat-style workspace
  ├─ Composer: intent / protocol preference / model + progress
  ├─ Conversation: text / image assets / version history
  └─ Protocol-independent UI contract: RequestEnvelope -> NormalizedResult
          │ (same-origin, session cookie, CSRF protection)
          ▼
NewAPI Playground BFF (/pg/*)
  ├─ authenticated user / group / quota / model mapping
  ├─ capability policy + request validation + idempotency hints
  ├─ Chat adapter -> NewAPI relay Chat
  ├─ Responses adapter -> NewAPI relay Responses
  ├─ Vendor Chat Image adapters (explicitly whitelisted)
  └─ Images adapter (compatibility)
          │
          ▼
Upstream model/channel; Results -> IndexedDB + localStorage
```

如果继续独立版开发，建议把 `src/api/client.ts` 按以下**职责**拆分。正式集成进 NewAPI 时，优先使用 `web/src/features/playground/hooks/use-stream-request.ts`（基于 `sse.js`）、`@/lib/api` 和现有 `relayconvert`，不按下表重新开发第二套同类实现：
```text
src/api/
  contracts.ts                  # UnifiedRequest, NormalizedResult, CapabilityProfile
  capabilities.ts               # Query authenticated capability catalogue
  transport.ts                  # dispatch, strict selection, request IDs, error mapping
  adapters/
    chat.ts                     # regular chat + image QA
    chat-image.ts               # vendor-specific chat image output only
    responses.ts                # text + image_generation tool
    images.ts                   # traditional Images API
  parsers/
    chat.ts                     # choices[].message; vendor image variants by profile
    responses.ts                # output_text + image_generation_call.result
    images.ts                   # data[].b64_json | data[].url
    sse.ts                      # only standalone adapter; production reuses existing sse.js hook
  client.ts                     # stable createImages/editImages/sendChat facade
```

先做 **非流式 Responses 图片** 和两种协议的**流式聊天**；在能拿到上游真实 partial image events 后，再接入流式图片预览，不能以定时动画假装真实产图进度。复用当前真实阶段提示组件 `GenerationProgress`。

### 统一传输契约（示例）

```ts
interface UnifiedRequest {
  idempotencyKey: string            // 本地去重与服务端重复保护；不等于上游必然幂等
  conversationId: string
  intent: Intent
  preference: UserPreference
  profileId?: string
  prompt: string
  referenceAssetIds?: string[]      // 浏览器需上传文件数据，不能仅传本地 ID
  previousResponseId?: string
  options?: { size?: string; quality?: string; count?: number; stream?: boolean }
}
interface NormalizedResult {
  status: 'complete' | 'partial' | 'failed'
  protocol: Transport
  model: string
  requestId?: string
  responseId?: string
  previousResponseId?: string
  text: string
  images: Array<{ id: string; mimeType: string; parentId?: string; dataUrl?: string; url?: string }>
  usage?: {inputTokens?: number; outputTokens?: number}
  error?: {code: string; message: string; retryable: boolean; chargedUnknown?: boolean}
}
```

服务端不得信任来自前端的模型、渠道、用户 ID、`referenceAssetIds` 所有权断言；来自浏览器的资源 ID 只是本地索引，不是服务端可直接读取的图片内容。实际调用时应附带经限制与格式校验的二进制 / data URL 上传。

## 5. NewAPI 路由（**计划新增**，不是现有功能）

- `GET /api/playground/capabilities`：根据用户已授权模型及管理员确认的能力模板，返回 `intents`/可选协议/当前默认配置。不得返回通用管理员凭证或渠道地址。
- `POST /pg/responses`：复用 NewAPI 的登录态上下文、现有 Relay 和计费，支持 Responses 格式及 tool。`previous_response_id` 由相应通道处理；路由需验证用户、模型、工具许可及限制。
- `POST /pg/images/generations`、`POST /pg/images/edits`：兼容纯图片操作，使用已有鉴权、额度计费、渠道分发和重试语义。
- `POST /pg/chat/completions`：已有；扩展兼容能力时谨慎确认第三方 Chat 图片返回的协议格式；不能将“支持视觉输入”误判为“支持生成图片”。
- 前端 BFF 可选一层 `POST /pg/image-playground/execute`，统一返回 NormalizedResult 或 SSE，但必须避免第二次重复结算。第一阶段可先使用显式协议路由再在前端归一。

严格做到 session 认证、同源、CSRF、分配渠道、限速、用量扣费、请求体限制、安全下载。不要把共享 NewAPI 管理员 Key/测试 Key 放到 GitHub Pages 或浏览器端；`VITE_API_MODE=mock` 的 GitHub Pages 作为演示继续存在。

## 6. 多轮上下文与本地存储

扩展 `Message` / `AssetRef`，记录：
- `intent` / `protocol` / `profileId` / 真实请求模型（快照）
- `responseId`、`previousResponseId`、`parentAssetId`、`channelAffinityKey`（如适用；不保存敏感凭证）
- 请求 `status`、错误码、耗时、是否已成功写入 IndexedDB
- 一次图片编辑可以从任何旧版本分叉新版本；不覆盖原图

**上下文选择**：
- Chat：将必要的近 N 轮历史文本和可用参考图显式发送，长度按模型限制裁剪。
- Responses：同一会话、同一兼容通道且上游确认存储有效时优先 `previous_response_id`。否则降级为**用户确认后重新提交**的完整上下文（历史文本、选中参考图），不得假装 Response ID 能跨 NewAPI 渠道无限有效。切换 Chat↔Responses 时使用本地规范消息重建语义，不直接复用对方的不可移植 response id。
- 不保存完整上游原始响应 JSON 进 localStorage（隐私+容量）；图片 Blob 只写 IndexedDB。确保检测容量错误、链接过期、浏览器清理数据后无法恢复，并允许导出。
- 服务端不在本期存储用户作品。用户的本地会话只应作为 MVP，不应跨账号混用而无告警；后续整合账号隔离要清理/迁移本地历史。

## 7. 操作和 UI 细节

- 发送前展示选定协议/模型；模型不支持当前任务时明确禁用并说明。
- 自动选择时对用户透明“将使用 Responses · XXX / 图片工具 YYY”。
- 多轮切换时在会话消息旁留一个小的协议信息/模型标记，可在详情里查看；在当前版本对话 + 图片工作区复用已有历史列表与编辑动画。
- 正在生成时只显示真实阶段（准备/网络请求/接收与保存），如响应支持流式分片可按真实事件更新；不猜百分比。
- 失败时区分不支持的协议、模型拒绝、限流、超时、未知收费情况、图片资源不可用；禁止静默吞错或改用 Mock 演示。
- 本期依旧是浏览器本地保存；登录 NewAPI 并不自动同步其作品，必须说明。

## 8. 优先落地阶段和验证门槛

1. **契约与迁移**：新增能力模板、联合类型、老 `settings` 和 `sessions` 的向后迁移；用静态模拟响应单元测试标准 Responses/Chat 两种文本响应、image_generation_call、Images API、典型兼容 Chat 图片扩展，以及错误处理。
2. **后端安全 BFF**：先完成 NewAPI 登录态 `/pg/responses`、`/pg/images/*`、capabilities；复用现有计费与模型映射；验证跨用户/渠道权限。独立 GitHub Pages 默认仍 Mock。
3. **真实聊天**：Chat Completions 与 Responses 双协议、各自流式、提示词/上下文保存。
4. **真实图片**：Responses image tool 与 Images API，然后针对具体供应商的 Chat 图片适配器；明确费率、支持情况、无损本地存图。
5. **路由自动选择**：仅验证过的能力允许 Auto 自动切换；产生收费风险后的失败必须由用户确认才重发。
6. **浏览器实测**：桌面/手机 UI、多轮编辑、切协议、重载/取消/断线、模型不可用、跨账号访问、错误费用风险。任何付费 smoke test 均在站长显式批准的最小测试额度内执行。

## 9. 必须验证的测试用例

- 文本 Chat：SSE token 正确拼接，断线恢复显示失败，不残留无限等待。
- 文本 Responses：`output[].content[].output_text` 被解析，可延续或显式重建上下文。
- 图片 Responses：工具输出 Base64 写入 IndexedDB，`responseId` 保存，选旧图继续编辑。
- 图片 Chat：官方标准 Chat 模型显示“不支持图片输出”；只有管理员登记适配器、经付费测试的渠道才显示可选项。
- 兼容 Images：图片输出 b64/json URL 两种形式、跨域与过期 URL 提示。
- 协议 Auto：预检可切换；上游请求超时后不得悄悄发送第二次付费请求。
- GitHub Pages：仍为公开静态 Mock，不泄露任何用户或管理员 token。
- NewAPI：同源、用户会话、分组/模型/额度权限与账单和普通 Relay 一致。
