# ADR-002 · 双部署模式、NewAPI 用户 Token/分组与 GPT Image 2.5 限定范围

> 状态：**技术架构已确认，开发实施仍待进行**（2026-10-18）。独立 GitHub Pages 当前仍是 Mock；`new-api` 主仓库未集成此图文 Playground 的新接口。本 ADR 不包含密钥、不发起付费调用、不改动图片本地存储。与 [ADR-001](PROTOCOL_REUSE_ARCHITECTURE.zh-CN.md)、[双协议方案](DUAL_PROTOCOL_PLAYGROUND.zh-CN.md) 共同生效；**本 ADR 的两种部署形态与模型白名单优先级最高**。

## 1. 产品边界

产品定位：**多模型图文 Playground（仅图片生成模型限定为 GPT Image 2.5）**，两种形式：
1. **Standalone**：作为独立域名/应用部署，可连接用户自己的 NewAPI 中转 Key；可使用独立轻量 BFF 保护凭证。
2. **Embedded**：作为 NewAPI 前端模块运行，同源 Session 登录，直接选当前账号已有的 Key（仅选择 ID，不取明文）及用户允许的分组。

两者共享：React 图文对话 UI、编辑器、请求编排、协议结果归一、语言包、IndexedDB 图片 Blob / localStorage 会话、图片版本关系。**只区别于运行时身份与 Transport Bridge**，不能做两套复制项目。

**唯一支持的生图与修图模型 ID（仅约束图像输出，不限制 LLM/VLM）**：
- `gpt-image-2.5-flare`：默认快捷生图，可在用户允许的范围内用于编辑。
- `gpt-image-2.5-sunburst`：高精度修图与需要精细控制的生成。
生图/修图后端和 UI 仅允许这两个精确 ID；不默认引入 DALL-E、旧 GPT Image、Gemini、Midjourney 或其他厂商**生图模型**。聊天与视觉理解的 LLM/VLM 不受该白名单限制，而是从 NewAPI 返回的当前用户已授权模型列表中选择（按分组、Token、能力过滤）。若图片模型有合法别名，由站点管理员做明确映射，不让客户端随意绕过限制。

**保留 Chat、Responses、Images 的协议抽象，但“支持协议接口 ≠ 当前可实际调用”：**
- **Images API**：官方 `POST /v1/images/generations`、`POST /v1/images/edits` 可直接 `model=gpt-image-2.5-{flare|sunburst}`。优先实现这条最直接的生图/修图路径，并以真实通道能力验证尺寸/质量/计费。
- **Responses API 图片**：`image_generation` tool 的顶层 `model` 从该用户可用的 **LLM（必须验证支持 image_generation 工具）** 中选择；tool 的 `model` 严格为 Flare / Sunburst。用户确认中转还提供其他 LLM/VLM，因此**不能因为只开放两款图片模型就判定 Responses 不可用**。但有 LLM/VLM 不等于一定支持该工具，还需检查通道和实际 API。
- **Chat API 图片**：标准 Chat Completions 并没有通用的出图响应协议。只在同一中转确认提供特定的 Chat 图片扩展并有 fixture 与实测后开启。当前默认不可用。
- **Chat/Responses 普通文本对话与图片理解**：使用中转已提供、用户有权限的 **LLM/VLM**。Chat 与 Responses 各自判断协议支持；图片理解需要 VLM/多模态输入能力。**不对这些模型使用图片生成模型白名单**，也不默认假定任意 LLM 都能输出图片。
- **连续编辑**：没有 Responses 图像工具也可在 UI 中使用 Images edits 逐步以最新结果/指定版本作参考，清楚说明并非持久 `previous_response_id` 对话上下文。

文档依据：
https://developers.openai.com/api/docs/guides/image-generation
https://developers.openai.com/api/docs/guides/tools-image-generation

## 2. 一套核心 + 两种运行时 Bridge

```text
packages/playground-core   (复用概念，实际可放 src/core 后逐步迁移)
  ├── domain/              Intent, ImageModelId(2款), Text/VisionModelId(授权列表), Asset, Message, Conversation
  ├── application/         send, edit, version, transport selection, real progress
  ├── ui/                  composer, gallery, preview, annotation, i18n
  ├── storage/             IndexedDB blobs + localStorage metadata
  └── port/
      └── PlaygroundGateway
             ├── getCapabilities()
             ├── getCredentials()/getTokenChoices()  (只读显示，不包含明文 key)
             ├── getGroupChoices()
             ├── submitChat()
             ├── submitResponses()
             ├── createImage()
             └── editImage()

runtime/standalone -> StandaloneGateway
    独立 BFF（推荐） + 用户自行输入/授权的低额度 NewAPI key
runtime/newapi -> EmbeddedGateway
    同源登录态 BFF (/pg/*) + 当前登录用户创建的 token ID
                                   │
                                   ▼
                NewAPI 原有 Relay / 渠道映射 / 额度 / 计费
                                   │
                                   ▼
                仅 gpt-image-2.5-flare / sunburst
                                   │
                                   ▼
                   浏览器图片及会话本地保存
```

**优先在已有独立仓库按 port/adapter 接口隔离，成熟后再把同一核心挂到 `Vsonic12138/new-api/web/src/features/image-playground`**。不要求提前迁移 monorepo；不再造第二套协议转换与计费服务。

### Gateway 适配语义

```ts
type ImageModelId = 'gpt-image-2.5-flare' | 'gpt-image-2.5-sunburst'
type Protocol = 'images' | 'responses' | 'chat'
type CredentialSelection =
  | { mode: 'embedded-account'; group?: string }
  | { mode: 'embedded-token'; tokenId: number } // token group comes from validated token policy
  | { mode: 'standalone-byok' }                 // key held by standalone backend session or memory only

interface PlaygroundGateway {
  capabilities(signal?: AbortSignal): Promise<{
    models: ImageModelId[]
    operations: Record<ImageModelId, {images: boolean; responses: boolean; chatImage: boolean}>
    requiresResponsesMainModel: boolean
  }>
  generate(model: ImageModelId, input: {prompt:string; count:number; size:string; protocol:Protocol}, signal?:AbortSignal): Promise<NormalizedImageResult>
  edit(model: ImageModelId, input: {prompt:string; image:Blob; protocol:Protocol}, signal?:AbortSignal): Promise<NormalizedImageResult>
  // text chat is a separate capability, disabled until a supported mainline model exists
}
```

UI 不将 API Key/渠道地址/真实上游 token 放入 Shared Core 的消息状态或 localStorage。

## 3. Embedded：用户自己的 Token ID + 分组

已核对本项目的 `Vsonic12138/new-api`：
- `GET /api/token/` 经 `middleware.UserAuth()`；`controller.GetAllTokens` 把 key 替换为掩码，显示 `id/name/group/model_limits/status/expired_time`。
- `GET /api/token/auto-groups` 可按登录用户返回允许的自动分组。
- `GET /api/user/models?group=...` 与 `GET /api/user/self/groups` 已供现有 Playground 的模型/分组选择使用。
- `POST /api/token/:id/key` **会在有权限的用户请求时返回完整明文 Key**；**此项目绝不使用该路由来选择已有 Token**，防止将明文泄露给 UI、DevTools/浏览器储存或第三方脚本。
- `model.GetTokenByIds(id, userId)` 可按所有者读取 Token；`model.Token` 有固定 `Group`、`CrossGroupRetry`、`AutoGroups`、模型限制、额度、过期、状态等。需要在服务端判定和执行，而不是相信前端的分组字段。

**设计两个可选模式：**
1. **账号模式**（无需创建 Key）：沿用现有 `/pg/chat/completions` 的登录用户与被允许 Group 选择行为；拓展适合 Images/Responses 的专用受保护 Playground 路由。该模式不是用户 Token 限额模式。
2. **Token 模式**（按用户已创建 Token）：前端只提交 `token_id`（整数）；服务端在**渠道分发/计费前**读取并验证 owner/status/expiry/IP/model-limits/quota/group 等，与普通 `TokenAuth()` 的规则保持一致。先抽取/复用现有 token-validation 和 request-context 逻辑，避免简单 `SetupContextForToken` 绕过常规检查。

**分组规则：**
- Token 绑定固定 `group`：UI 展示只读或不显示额外 Group 下拉。**不能用请求中的 group 覆盖 Token 的权限。**
- Token group 为 `auto`：按其 `AutoGroups`、跨组重试规则和用户允许组集合执行。UI 仅展示服务端实际许可的选项。
- 账号模式的 group：只展示用户授权可用的 group；选择后由服务器再次验证，与通道映射保持一致。
- 与已有 `middleware.Distribute()` 的先后顺序有关：不能在执行 `Distribute()` 后才决定 Token。应有 `ResolvePlaygroundPrincipal` / `ValidateSelectedToken`（在分发前），但优先复用既有 middleware / 服务层而非复制整套逻辑。
- Token 撤销、模型权限变更和额度不足须在每次请求重验；前端缓存只用于选项展示。
- 避免将 Token 明文写入日志；UI 显示掩码、名称、状态、分组即可。

## 4. Standalone：两种交付选项

### 推荐：独立 SPA + 最小 BFF（可使用 Go，与 NewAPI Relay 分离）

- 独立 BFF 负责设置的 NewAPI Base URL allowlist、临时会话、用户输入 Key 的临时加密/内存凭证、转发和限流、CORS、CSRF 与代理超时；前端不会收到或缓存服务端凭证。
- 用户自己在 NewAPI 控制台创建 **低额度、仅授权需要的模型（两款图像模型 + 可选 LLM/VLM）及必要 Group** 的 Token，一次输入到独立服务的安全连接流程。通过单独 HTTPS 页面与后端建立会话，Session Cookie 采用 HttpOnly/Secure/SameSite，响应头禁止缓存。用户也可以分别创建生图/聊天专用 Token。
- 若要选择不同组，用户在 NewAPI 中为不同 Group 创建/配置 Token，独立前端切换已授权连接；无法凭借一个固定 Group Token 任意改组。
- Key 不放到 `VITE_*`、构建产物、公开 GitHub Actions、localStorage/IndexedDB；服务器也不应该长期存放明文。多用户独立服务必须为每个会话隔离，限制内存/时长。
- 独立 BFF 只负责**鉴权与请求转发**，不重做 NewAPI 的协议/用量结算；由远端 NewAPI 的 TokenAuth/Distribute/Relay 完成。
- 只允许与管理员事先登记的 NewAPI 服务地址建立连接，避免攻击者提交任意目标造成 SSRF/公开代理；禁止将服务公开成无鉴权的通用中转。

### 可选：纯静态 GitHub Pages BYOK（高级、需明确安全风险）

- GitHub Pages 只能提供静态文件，**不能隐藏浏览器发送到第三方服务的用户 Key**。
- 可以在用户充分理解风险且服务端允许浏览器 CORS 时，做“用户主动粘贴**自己创建**的低权限 Key，当前标签页内存临时保存”的受限选项。页面不得自动抓取 NewAPI Token 明文，不得写入 localStorage/IndexedDB/URL/日志；刷新丢失，需要再次输入。
- 因 XSS、浏览器扩展、脚本注入等威胁，不建议把这种客户端 BYOK 直连作为公开商业多用户站的默认生产方案。
- 当前已部署 Pages 保持 Mock；不能仅把 `VITE_API_MODE` 改为 `relay` 就宣称可生产使用，因为 `vite.config.ts` 的密钥注入仅在本地开发代理运行。

## 5. 真实功能开关与模型 UX

**运营模式**：站点启动后由 gateway 返回只读 capability，而不是以 `VITE_API_MODE !== 'relay'` 静默使用 Mock。独立站/嵌入站生产不可自动回退 Mock。

运行时能力应根据 **当前登录用户、所选 Token、Group、模型及协议** 查询，不应假定全站只有两款模型。示例返回（其中布尔值仅演示数据结构，**不代表已验证你的实际通道**）：
```json
{
  "imageModels": ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"],
  "defaultGenerateModel": "gpt-image-2.5-flare",
  "defaultEditModel": "gpt-image-2.5-sunburst",
  "llmModels": ["<from-user-authorized-newapi-models>"],
  "vlmModels": ["<from-user-authorized-newapi-models>"],
  "transports": {
    "images": {"generate": "unverified", "edit": "unverified"},
    "responses": {"textChat": "unverified", "imageQa": "unverified", "imageTool": "unverified"},
    "chat": {"textChat": "unverified", "imageQa": "unverified", "imageOutputExtension": "unsupported"}
  },
  "responsesMainModelsWithImageTool": [],
  "storage": "browser"
}
```

生产接口不能按模型名或“属于 VLM”就推断工具支持。NewAPI 已提供的 LLM/VLM 用于文本聊天、视觉理解、Responses 主模型候选；只有**经过验证**具备 image_generation 工具调用能力的模型才进入 `responsesMainModelsWithImageTool`。图片工具仍只能选择两款 GPT Image 2.5。Responses 主模型与图片工具可能产生分别计费，UI 应明确说明。

### 用户界面
- 顶部：连接状态（独立 BYOK/已登录 NewAPI）、凭证（Key 名称+掩码/账号）、当前 Group（固定时只读）。
- Composer：`生图`/`修图` 只允许两款 Image 2.5；`聊天`/`图片问答` 使用当前 Token/分组可用的 LLM/VLM 模型。`协议` 按当前任务和所选模型的真实支持情况呈现 Chat / Responses / Images，未验证选项灰掉并说明。
- 文本及图片理解功能可以对接现有 LLM/VLM（须经过用户权限和协议校验）；不能把 Flare/Sunburst 当作普通文本模型，也不能把 VLM 的图片理解能力误判成图片输出。
- 作品集和历史仍本地保存，显示“仅当前设备”而不提示已云端保存。
- 连接失败、令牌到期/额度不足、Group 不支持或模型权限不足，应呈现明确可操作错误，绝不自动切换陌生 Key 或静默重复扣费。

## 6. 接口建议（**仅设计，尚未实现**）

```http
GET /api/image-playground/capabilities          # 登录态 + 当前可用模型、协议开关
GET /api/image-playground/credentials           # 账号模式/用户 Token 元数据，不返回 key 原文
GET /api/image-playground/groups?token_id=...   # 当前模式允许的实际分组
POST /pg/image-playground/generations            # 账号/TokenID -> existing Relay Images
POST /pg/image-playground/edits                  # multipart + existing Relay Images
POST /pg/image-playground/responses              # 只有能力 verified 才开放
POST /pg/image-playground/chat                   # 只有能力 verified 才开放
```

统一请求外层 `{ credentialMode, tokenId?, model, intent, protocol, group? }` 需按协议处理 multipart/JSON；**不能将 tokenId、group 盲塞进 OpenAI 上游请求体**。网关用可信会话重构 token context，严格校验 Group。与 `/v1/*` 令牌鉴权、`/pg/*` 登录态之间保持清晰边界。

## 7. 实施顺序

1. **先保证独立现有 UI 不退化**，新增纯类型配置、双模型白名单及 `PlaygroundGateway` 接口，Mock 保持显式示例。
2. **优先实测两款 Images API**：每个模型最小额度验证 generations+edits，识别 b64/url、质量和尺寸实际支持（须得到站长许可才收费测试）。
3. **Standalone 可用版**：最小 BFF + 用户自有 Token 连接会话，Browser IndexedDB 保存。若坚持纯 GitHub Pages，需另做 CORS/BYOK 风险提示和手工确认。
4. **Embedded NewAPI**：后端 tokenId 安全解析、组权限和计费路径扩展；前端调用同源 gateway，选择用户 Token/Group。
5. **协议增强**：从现有 NewAPI LLM/VLM 模型列表接入 Chat/Responses 文本与图片理解，验证支持 image_generation 工具的 Responses 主模型；第三方 Chat 图片扩展仅在具体渠道支持并验证后启用。始终只允许两款图片生成模型。
6. **回归**：双用户隔离、撤销 Token 即时生效、固定组不能修改、图片模型限制、错误费用风险、本地历史、手机体验、已有 Chat/Responses Relay 用量不退化。

## 8. 明确非目标

不做第三方厂商模型插件市场、不做图片云同步/R2、不将目前图片文件塞 NewAPI 数据库、不新增第二套计费服务、不假装免费上下文、不开无认证的通用 Key 代理。
