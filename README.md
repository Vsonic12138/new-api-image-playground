# New API Image Playground

A standalone, integration-ready prototype of a ChatGPT-style image conversation workspace for [New API](https://github.com/QuantumNous/new-api), built with **React + TypeScript + Vite + react-konva**. Development happens outside the main New API repo; once proven, the `src` modules can be integrated into New API's existing Playground.

**Status:** Dual-host architecture in a draft PR; GitHub Pages remains Mock-only. Standalone BYOK has a Node BFF; NewAPI Embedded is an optional same-origin integration pending PR review. **No Mask / precise inpainting.**

[中文说明 / Chinese README](README.zh-CN.md) · [无需安装的离线交互原型](demo/index.html)

## Features

- Chat-styled sessions with local history and image results
- Text-to-image through OpenAI-compatible `POST /v1/images/generations`
- Whole-image editing through `POST /v1/images/edits` (multipart form)
- Plain text conversation through `POST /v1/chat/completions`
- Image upload, reuse a previous image, regenerate, download, per-image history
- `react-konva` brush and rectangle annotations with undo/clear
- Optional export of the **composited annotated image** to edits. This is **NOT a mask** and may lead to imperfect region edits.
- Browser IndexedDB storage for returned binary images; remote URL fallback where the provider disallows CORS
- Mock mode that can be explored without a provider or token
- API adapter isolated in `src/api/client.ts` for later New API integration

## Local development

Use Node.js >= 20.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://127.0.0.1:5173. The default `VITE_API_MODE=mock` does not call an API. Mock images are bundled demo assets; generation is simulated.

## Test with your New API relay

Configure `.env.local`:

```dotenv
VITE_API_MODE=relay
NEW_API_BASE_URL=https://your-new-api.example.com
NEW_API_TEST_TOKEN=YOUR_RESTRICTED_TEST_TOKEN
```

Restart `npm run dev`. Vite's development-only proxy forwards `/relay/v1/...` requests to your New API and injects a test token **server-side**. The token must be low-quota, restricted and must never be committed or shared. `NEW_API_BASE_URL` is the **host origin**, not a URL ending in `/v1`.

This development proxy is **not** a production authentication implementation. Do not publish a Vite dev server or put `NEW_API_TEST_TOKEN` into a `VITE_*` variable. When embedding into New API, substitute the current user's authorized and quota-aware same-origin server route, e.g. `/pg/images/generations` and `/pg/images/edits`, after implementing server-side authentication and channel resolution. Do not expose an all-user master token to the browser.

The image model and chat model can be edited from the settings dialog. Model support for `n`, `size`, and image edits varies among compatible providers; use what your relay actually supports.

## Usage

1. Choose **生图**, enter a prompt, send. Results appear inline in the conversation.
2. Click any image, **继续编辑**, mark the image, write an edit prompt, submit. Or choose **修图** and send a follow-up referencing the selected image.
3. Use **对话** for text chat. The currently selected image is not automatically interpreted by the text model.
4. The current MVP uses *explicit modes* instead of fully automatic model/tool orchestration. Automatic intent routing can be added later.

## Limitations and known tradeoffs

- This version does not build an actual Alpha/Mask image. Red drawings are composited onto the input image if you choose “附上已圈选标记的图片”; the output may show marks or ignore selected regions.
- Third-party image URLs may expire or not allow browser CORS downloads. The app attempts to store returned images in IndexedDB; if it fails, history keeps the original URL and subsequent edits may be blocked by CORS. Production should ingest generated images into controlled object storage (R2/S3/MinIO) through a trusted backend.
- Browser conversation metadata lives in localStorage, and returned blobs in IndexedDB: suited for a demo only. Production should use New API's authenticated backend and per-user sessions.
- Local image samples are demonstration assets cropped from internally generated UI concepts, not actual inference results.
- No streaming chat, moderation control, rate limiting, server-side file retention or automated retries yet.
- Build/test depends on downloading npm packages. In this handoff environment npm registry access may be unavailable; run `npm install && npm run build` in your normal development environment before deployment.

## Primary files

| Path | Purpose |
|---|---|
| `src/App.tsx` | Chat session page, creation/edit flow, sidebars |
| `src/api/client.ts` | Mock and OpenAI-compatible relay adapters |
| `src/components/EditorModal.tsx` | react-konva image annotation/edit dialog |
| `src/components/ImageView.tsx` | Durable image assets and preview |
| `src/lib/image-store.ts` | IndexedDB blob persistence and file conversion |
| `src/lib/conversations.ts` | Demo conversation history and settings |
| `vite.config.ts` | Development-only secure proxy |
| `docs/INTEGRATION.md` | Proposed integration to `Vsonic12138/new-api` |
| `docs/ACCEPTANCE.md` | Manual testing plan |

## Upstream inspiration / licensing

- [New API Playground](https://github.com/QuantumNous/new-api): design/integration target. The application here uses its own original code rather than copying AGPL-covered source files.
- [OpenAI Image WebUI](https://github.com/tobenot/openai-image-webui): inspiration for the image workflow. No third-party implementation code has been copied into this scaffold.
- [react-konva](https://github.com/konvajs/react-konva): annotation canvas library.

Check respective component/library licenses and the license of New API before copying code into the main repository or offering a hosted version. If reusing code from OpenAI Image WebUI later, preserve its MIT attribution.

## Dual-host builds

- `npm run build:standalone`: builds the shared React application for the Node BFF. Launch behind HTTPS or use the Dockerfile.
- `npm run build:embedded`: builds the **same React application** for NewAPI sessions. Serve `dist/` at `/pg-image-workspace/` on the NewAPI HTTPS origin.
- NewAPI Fork draft PR #2 registers `/image-workspace` and authenticated `/pg/image-playground/*` routes. This is a native integration, not a Task Plugin marketplace install.

See `docs/ARCHITECTURE_DUAL_HOST.md` and `integrations/newapi/README.md`.
