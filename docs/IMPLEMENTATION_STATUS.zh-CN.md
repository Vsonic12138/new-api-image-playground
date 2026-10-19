# 当前代码落地状态 · 2026-10-19

> 真实模型 API 代码和独立服务端已经写入仓库；**未执行任何付费生图或聊天请求**。GitHub Pages 仍是 Mock 演示。NewAPI 后端登录态路由目前位于 [草稿 PR #2](https://github.com/Vsonic12138/new-api/pull/2)，**尚未合并，也不可视为生产可用**。

## 运行形态

| 运行方式 | 构建入口 | 凭证如何处理 | 当前状态 |
| --- | --- | --- | --- |
| GitHub Pages Mock | `npm run build` + `VITE_API_MODE=mock` | 无凭证、只返回示例图 | 已存在；静态 Pages |
| 本地开发 Relay | `npm run dev`，`.env.local` 设置 `VITE_API_MODE=relay` | 低额度测试 Key 仅 Vite 服务端注入；loopback only | 代码已接线，需自行验证上游 |
| 独立部署 | `npm run build:standalone` 然后 `npm run start:standalone` | 用户主动输入自己创建的 Key，由 Node BFF 的短期内存会话持有，cookie 为 HttpOnly | 服务端和 React 接线已实现；未做生产负载/安全完整审计 |
| 嵌入 NewAPI | 生产集成构建设置 `VITE_API_MODE=embedded` | Session + 用户选择的 Token ID，绝不获取明文 Key；后端普通 TokenAuth 验证 | 前端已有接线；后端功能仅 Draft PR，未上线 |

## 独立端在自己设备/服务器运行（不付费，除非主动发送真实模型请求）

环境：Node.js 22+。推荐 Linux / Docker 等持续运行的机器，可经 Nginx/Caddy 反向代理提供 HTTPS。

```bash
npm install
npm run build:standalone
NODE_ENV=production \
  UPSTREAM_API_BASE_URL=https://你的newapi域名/v1 \
  HOST=127.0.0.1 PORT=3005 \
  npm run start:standalone
```

浏览器访问经 HTTPS 反向代理暴露的站点域名（不要直接公开未经 TLS 保护的 3005 端口）。页面顶部点「连接我的 Key」，输入你在 NewAPI 创建的 **低额度、明确限制模型及分组权限的用户 Token**。服务器通过 `/v1/models` 验证后保存在短期内存会话，不入库、不在 localStorage 保存、不放入前端构建产物。连接成功后从 `/api/models` 动态加载可见的模型清单，供 Chat/Responses 主模型选择。

**独立服务端必须设置固定 `UPSTREAM_API_BASE_URL`**。不支持浏览器提交任意目标 URL，防止开放代理/SSRF。单进程内存 session，重启后失效；多副本部署需要粘性会话或重新设计共享安全会话。生产环境需要严格的 HTTPS reverse proxy、容量限制、访问日志脱敏、速率限制与安全审计；当前是最小工程实现而非完整的公开运营方案。尤其不要允许未经审计的多租户公网服务直接使用。

## 操作/协议

- 生图/修图模型**只允许** `gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`。
- 文本/VLM 的 Chat / Responses 主模型可从 NewAPI 提供的用户可用列表中选取，不受上述图片白名单限制。
- 文本：`Chat Completions` / `Responses`，当前实现为**非流式**请求（按完整消息展示）；当前阶段尚未接 Chat/Responses 实时文字增量 SSE。
- 图片：`auto` 当前明确映射到 **Images API**（不是未经验证的自动通道回退）；可手动切到 Responses 图片工具，前提是你选用的 Responses 主模型支持工具且通道正确处理工具模型名/计费。
- **Chat 协议生图**是非标准供应商扩展，当前不可用且不会发起付费试探请求；未来确定第三方 Chat 图片返回格式再加适配器。OpenAI 官方标准 Chat 接口支持视觉输入文本输出，但不提供统一的图片生成输出契约。
- 图片从真实响应收到后尝试保存到 IndexedDB，消息元信息及实际协议/模型保存在 localStorage。未启用云端作品库，清理浏览器数据可能丢失历史。
- 网络失败后不悄悄再发其他协议的请求，避免重复计费；不凭进度动画提供假的完成百分比。

## NewAPI 草稿 PR 的验收关口

[NewAPI PR #2](https://github.com/Vsonic12138/new-api/pull/2) 包含 `/pg/image-playground/chat/completions`、`/pg/image-playground/responses`、`/pg/image-playground/images/generations`、`/pg/image-playground/images/edits`，以及 `X-Playground-Token-ID` 和 `X-Playground-Group` 的服务端验证设计。必须经过：

1. Go fmt/vet/build/test 和前端 typecheck。
2. 用户 A 不能通过 ID 选用户 B 的 token；token 被撤销、过期、限额、IP 限制、模型限制和 group 权限须与常规 TokenAuth 完全一致。
3. 分组固定的 token 不允许额外选择 group，自动分组的候选由后端确定。
4. account-mode 仅使用该用户授权 group；反向代理、Origin/CSRF 与 multipart 请求需要专项验证。
5. Responses 主模型+图像工具的两层渠道映射和计费必须正确；图片修图的 multipart 和流式行为需要集成测试。
6. 生产前征得用户对最小付费 smoke test 明确批准；未批准不能真的请求模型。
7. 该 PR 不应在上述验证完成前合并部署。前端 embed 入口亦不应单独上线。

## 待继续完成

- 独立服务的外部审核、内存会话并发/限流、可观测性与容器部署示例。
- Embedded 在 NewAPI 项目中集成 React 组件与构建资源（不能只配置 `VITE_API_MODE=embedded` 就当作已部署）。
- Chat 和 Responses 的文本 SSE、停止生成与实时图片进度接线。
- 为上下文跨轮续接验证 `previous_response_id`、存储策略/渠道黏性。
- 用户作品集、本地清理导出、将来可选 R2（当前不实施）。
