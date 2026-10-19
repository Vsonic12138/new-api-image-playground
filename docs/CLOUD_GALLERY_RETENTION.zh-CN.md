# NewAPI 图片作品集：云端保存与自动清理（方案 C）

> **设计/实施规范，尚未上线。** 当前独立 Playground 的图片实际存于浏览器 IndexedDB、会话存于 localStorage；GitHub Pages 是 Mock 演示。文中接口、后台设置、R2 和定时清理均属正式集成阶段待实现能力，不能将它们描述为已生效。

## 目标

- 每个已登录的 NewAPI 用户拥有独立的云端作品集（生成图、上传的参考图、编辑版本），可以跨设备查看、下载、删除。
- 站长从 NewAPI 管理后台设置统一的图片保存期限；到期自动删除**图片文件**，减少存储费用。
- 用户生成/上传时、查看作品集时和到期前都能清楚看到保存期限、到期时间和如何下载。
- 维持 NewAPI 已有鉴权、计费、渠道分发和权限系统，不复制一套公开代理或将上游 token 发送给前端。

## 管理员设置

在系统设置增加“图片作品存储”分组（仅管理员有权修改），后台使用现有 option/setting 机制存储非机密策略：

| 字段 | 建议默认 | 说明 |
| --- | --- | --- |
| `image_gallery_enabled` | false，待 R2 正确配置且联调通过后开启 | 未启用时绝不宣称云端保存 |
| `image_retention_days` | 30 | 整数 1–3650；`0` 表示不自动过期（永久直到用户删除），需额外确认存储费用 |
| `image_expiry_notice_days` | 7 | 可选 1、3、7；如果期限较短，通知从创建时立即显示 |
| `image_expiry_notice_enabled` | true | 站内提醒；邮件通知是后续可选扩展 |
| `image_expired_keep_metadata` | true | 图片到期后保留可授权访问的文本提示词和非敏感版本索引；不保留对象链接、缩略图或图片 Blob |
| `image_cleanup_enabled` | true | 仅在存储与任务调度准备就绪后启用 |
| `image_cleanup_batch_size` | 100 | 每批删除上限；可配置但应限制合理区间 |
| `image_cleanup_interval` | 1h | 后台周期扫描；实际删除以任务执行时间为准，不保证到秒 |

**重要语义**：策略变化默认只影响**新创建**的文件；每份已保存文件独立持有 `expires_at`。缩短期限时不允许静默追溯删除历史文件。若管理员主动选择“应用于已有作品”，先显示受影响文件数量与预计空间，二次确认，并将任何提前删除的 `expires_at` 至少推迟到 **7 天后**，同步站内通知。延长旧图片期限可通过显式迁移操作进行。规则应以服务端时间（UTC）为准。

建议支持手动输入天数，并提供快捷选项：1 / 7 / 30 / 90 / 180 / 365 / 永久。

## 用户可见提示

1. **生图/上传前**：在输入框附近写明“作品自动保存在个人作品集，默认保留 30 天。到期自动清理，请及时下载。”从服务端查询真实策略，不能前端写死“30 天”。
2. **生成完成后**：返回真实 `created_at`、`expires_at`、`storage_status`。仅在服务端确认对象已保存成功时显示“已保存到作品集”。失败时必须醒目提示“仅此次可查看，请立即下载”，不得显示已保存。
3. **作品集**：每张卡片提供创建日期、到期日期、剩余时间（例如“7 天后自动删除”）、下载、删除、继续编辑。即将过期排序/筛选是可选能力。
4. **到期前**：提前设置天数在站内通知中心生成可持久阅读的通知（按作品或批次去重）；用户下次登录仍能看到，提醒必须包含“查看并下载”入口，不要只用短暂 Toast。
5. **管理员更改保存规则**：在设置保存时明确说明是否只影响新文件；若影响现存文件，必须先告知用户宽限到期时间。
6. **到期后**：相关卡片显示“图片已过期并清理”，下载/编辑操作不可用；如果策略允许，仍能查看原提示词和文字历史。遇到对象存储删除暂时失败时，不能误报完成。
7. **保留期限为永久**：显示“站点目前未启用自动过期；管理员仍可修改策略”，避免承诺绝对永久。
8. **作品集空状态**：明确“不代表站长已经启用图片云端存储”，避免将本地缓存误作跨设备作品。

## 服务端数据模型（示例）

建议新增 `image_assets`，不要把图片二进制直接塞进 MySQL/SQLite/Postgres：

```text
id (UUID/ULID, primary key)
user_id (indexed, required; 从服务端登录态获得，不接受前端自报)
conversation_id (nullable, indexed, user-owned)
parent_asset_id (nullable; 版本关系，必须验证属于同一 user_id)
origin (generation | edit | upload)
prompt / prompt_reference (按产品隐私策略存储；可选)
object_key (private bucket key; not public URL)
mime_type, size_bytes, width, height
status (pending | ready | delete_pending | expired | storage_failed)
created_at (UTC)
expires_at (UTC, nullable iff retention_days=0)
retention_policy_version
expiry_notice_at / expiry_notice_sent_at (nullable)
delete_attempts, last_delete_error, deleted_at
```

任何业务读取/下载/编辑/删除都必须约束 `user_id = 当前会话用户`。派生缩略图、注释中间文件和编辑版本都必须有可追踪的对象键和清理记录，不能只删除原图而留下可访问副本。

## 对象存储

推荐 Cloudflare R2（S3 兼容），也允许 S3/MinIO 可替换实现。仅服务端保存 endpoint、bucket、access key 和 secret key，绝不存到前端、`VITE_*`、公开 GitHub Secrets 输出或浏览器 localStorage。

- Bucket 默认私有，禁止匿名列目录和公开读。
- 对象键由服务端生成，例如 `images/{user_id}/{asset_id}/original.webp`；不要由用户直接指定任意路径。
- 下载走鉴权后的代理流或**短有效期**签名 URL（不得持久写入聊天记录）；Content-Disposition 适合下载。
- 输入图片限制体积/类型/像素、验证真正解码、处理恶意图片；第三方 URL 服务端抓取必须做 SSRF 防护、重定向限制、超时与大小限制。
- 需要内容存储失败策略、重试、速率限制、审计；不要因为展示了上游可过期 URL 就认为已永久保存。

## API 契约（待实现的示例路由）

这些路由应是同源且受 `middleware.UserAuth()` 及权限校验保护，不是公开的代理入口。

| 方法/路径 | 权限 | 功能 |
| --- | --- | --- |
| GET `/api/image-playground/policy` | 登录用户 | 返回公告用 `enabled`、`retention_days`、`notice_days`、`policy_updated_at` |
| GET `/api/image-playground/assets?cursor=...` | 登录用户 | 仅当前用户作品，分页/状态/到期时间 |
| GET `/api/image-playground/assets/:id` | 作品所有者 | 查看元数据与编辑链 |
| GET `/api/image-playground/assets/:id/content` | 作品所有者 | 受控下载/短期 URL，不允许已过期的文件继续被访问 |
| DELETE `/api/image-playground/assets/:id` | 作品所有者 | 幂等删除用户作品，后台可靠删除对象 |
| GET `/api/image-playground/expiry-notices` | 登录用户 | 持久化提醒和已读状态（可整合 NewAPI 通知系统） |
| GET/PUT `/api/option/image-gallery` | 管理员 | 修改全站策略，严格验证参数 |
| POST `/api/admin/image-gallery/cleanup/preview` | 管理员 | 估算将删除数、占用容量、受影响用户 |
| POST `/api/admin/image-gallery/cleanup/run` | 管理员 | 显式触发带审计的清理任务 |

图片生成与编辑继续走 NewAPI 原有账号认证、渠道分发和额度结算路径；**上游响应要先落对象存储并返回稳定 Asset ID**，不要把一次性的外链当作云端作品。异步返回时应有存储状态和失败提示；上游账单失败/成功与存储失败不能混为一谈。

## 后台定时清理（优先复用 NewAPI 现有 SystemTask）

仓库已有 `model/system_task.go`、`controller/system_task_handlers.go` 和 `service` 系统任务框架。建议注册 `image_gallery_cleanup` 定时任务（默认每小时运行）。

1. 获取数据库租约（多实例只能一个清理作业执行），记录开始时间、策略版本、批次和统计。
2. 扫描 `status=ready AND expires_at <= now()`，每批 `<= 100`，使用条件更新/乐观锁把对象标为 `delete_pending`。
3. 删除 R2 原图、缩略图和所有可清理的关联对象。对象存储“已不存在”应视为幂等成功。
4. **只有存储删除确认为成功后**，事务更新文件记录为 `expired`，并删除/脱敏对象键；根据策略保留或删除文本元数据。失败则记录并指数退避重试，绝不能先删数据库记录导致无法回收。
5. 清理工作应可恢复、可重复执行、可审计。记录执行数、失败数、释放字节、下次重试时间；不会影响已结算的用量和计费日志。
6. 在每次任务运行前或通过定期提醒作业，依据 `expires_at` 和用户设置生成持久化通知并去重。对象即将过期的提示不以浏览器是否在线为前提。

**边界与失败情形**：

- 只创建了图片元数据却没有对象 → `storage_failed`，不显示“已保存”。
- 同一作品被用户手动删除并被后台任务同时扫描 → 幂等处理，先锁定/更新状态。
- 数据库成功、对象删除失败 → 可恢复重试；对象成功、数据库更新失败 → 再次删除视为幂等成功。
- 管理员缩短保存期限 → 先显示影响范围，通知 + 7 天宽限，不应立即批量删除。
- 用户正在编辑即将到期作品 → 服务端再次验证所有权与存储状态；输出新图独立计算 `expires_at`。
- 留在浏览器的 IndexedDB 图片需要独立“清除本地缓存”策略，不能把服务器删除等同于清空用户机器上的已有下载/离线缓存。
- 不保证删除 GitHub、客户端、上游供应商或用户自己下载过的副本；用户说明应精确写成“从本站作品存储中清理”。

## 开发实施顺序

- **阶段 1：服务端底座** — 新表迁移、管理员设置、R2 适配、账号鉴权 API、保存可靠性；默认关闭新功能。
- **阶段 2：产品界面** — 替换旧“我的作品”为全账号作品集；生成时告知期限；展示存储状态、到期日和编辑版本；国际化。
- **阶段 3：定时任务** — 租约、到期通知、批量清理、幂等重试和后台任务观测；先 dry-run，再逐步开启。
- **阶段 4：上线验收** — 双账号隔离、跨设备持久化、短期链接、清理/恢复与迁移、各类失败提醒和成本观察。

## 验收场景

1. 用户 A 的作品在其他浏览器登录用户 A 可见，用户 B 无法列出/读/编辑/下载/删除。
2. 30 天策略下服务器返回准确的 UTC `expires_at`，用户看到一致的本地化时间。
3. “提前 7 天通知”在站内通知中心可查询，重复调度不创建重复通知。
4. 期限 1 天时生成当下就展示过期提示，不等到“剩 7 天”。
5. 管理员从 90 天缩为 7 天，历史作品不会无提示被立即清掉。
6. R2 删除遇到 429/5xx 时保留可重试任务；下次成功后元数据与派生对象都清理。
7. 上传图片、生成图片、编辑版本、缩略图按同样的生命周期管理。
8. 页面在存储未启用/存储失败时不会显示“已云端保存”。
9. 删除文件不会错误删除历史用量/账单，除非另有独立且合法的计费日志保留政策。
10. GitHub Pages Mock 状态仍明确说明“演示模式，无云端存储”。

相关实现入口：`src/lib/image-store.ts`（当前 IndexedDB）、`src/lib/conversations.ts`（当前 localStorage）、`src/api/client.ts`（当前 Mock/开发代理），NewAPI 的 `model/option.go`、`model/main.go`、`model/system_task.go` 和 `controller/system_task_handlers.go`。
