# Integration plan: Vsonic12138/new-api

> 云端作品库、管理员保留期限、到期通知和定时清理的详细实施规范见 [CLOUD_GALLERY_RETENTION.zh-CN.md](CLOUD_GALLERY_RETENTION.zh-CN.md)。**该功能尚未上线。**

> 双协议图文对话（图片与文字同时支持 Chat / Responses；兼容 Images API）设计：[DUAL_PROTOCOL_PLAYGROUND.zh-CN.md](DUAL_PROTOCOL_PLAYGROUND.zh-CN.md)。Chat 图片生成仅在经过验证的供应商扩展下启用。

> 实施技术选型及不重造轮子原则见 [ADR-001：现有协议栈复用](PROTOCOL_REUSE_ARCHITECTURE.zh-CN.md)。

## Architecture

This standalone project is a **feature-isolated prototype**. The production New API app should keep its existing Go Relay, quota charging, user auth and model mapping. Avoid reimplementing a public relay.

1. Copy/refactor visual components (`ImageView`, `EditorModal`, chat result card, styles) into `web/src/features/playground/components` or a new `web/src/features/image-playground` module.
2. Adapt the image API client to New API's existing `@/lib/api` request helper, session cookies and normalized errors. Use `src/api/client.ts` as the adapter interface, not hard-coded fetches scattered through UI.
3. Add same-origin server-side, logged-in Playground routes (suggested `POST /pg/images/generations` and `/pg/images/edits`) with the same `middleware.UserAuth(), middleware.Distribute()` and standard billing path as the existing `/pg/chat/completions` route. Confirm whether routing images through `controller.Playground` works for `RelayFormatOpenAIImage`; if not, implement a dedicated controller that invokes the normal Relay flow after creating a user-scoped context. **Don't just expose an unauthenticated proxy.**
4. Existing image-related Go files to review: `relay/image_handler.go`, `controller/plugin_protocol_image.go`, `router/relay-router.go`, `controller/playground.go`.
5. Merge image messages with New API's existing Playground message schema. Store resulting files in authorized object storage; return stable IDs. Implement permission checks on every image and conversation.
6. Review quota semantics for image count, size, and edits; failed-image jobs should be handled by existing billing/retry/refund behavior.
7. Confirm the actual third-party upstream `model`, `size`, `n` and image part format before exposing controls broadly.

## Product phases

- **v0.1:** Explicit generation/edit/chat mode; upload and image result messages; annotator saves red strokes on copied input when requested; browser mock, client relay.
- **v0.2:** production auth/API integration; image object storage and history; user ownership and quota; upload validation.
- **v0.3:** automatic intent classification and model switching; precision Mask when upstream supports it; full edit version graph.

## Security checklist

- No upstream secret in `VITE_*` env, React bundle, localStorage, or frontend code.
- Development Vite proxy must remain loopback-only and use a restricted test token.
- Production upload/file relay: limit MIME and bytes, inspect image decoding, rate-limit, and enforce ownership; prevent SSRF on external URLs, cap redirects, timeouts, and response sizes.
- Avoid dynamic arbitrary upstream URLs supplied by end users; lock target to admin-approved channels.
- Never persist generated images in unauthenticated public buckets by default.
- Test cross-origin references: some remote URLs won't provide CORS and must be copied server-side before editing.
- Observe New API's AGPL license conditions when integrating and deploying a derivative version.
