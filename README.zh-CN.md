# New API Image Playground（独立开发版）

这是一个准备将来集成到 `Vsonic12138/new-api` 的独立前端工程。界面参考之前确认的三张原型图，技术栈是 React、TypeScript、Vite、react-konva。

## 已实现的 MVP 源码

- 会话列表、图文消息、图片生成结果卡片、图片详情与历史记录
- 文生图：`POST /v1/images/generations`
- 图片编辑：`POST /v1/images/edits`
- 文字聊天：`POST /v1/chat/completions`
- 参考图上传、继续编辑、再次生成、下载
- react-konva 画圈/画笔、框选、撤销与清空标注
- Mock 演示模式，无需 API Key
- 图片 Blob 尽可能持久化到 IndexedDB

目前**没有 Mask**。画圈仅是给模型的视觉标注，可选择把圈选结果合成进参考图发送到图片编辑接口；模型不一定准确限定修改区域。

## 立即预览

直接用浏览器打开 `demo/index.html` 可以体验无需安装依赖的**离线交互演示**。它使用原生 Canvas 模拟画圈操作，正式 React 代码对应的组件在 `src/components/EditorModal.tsx`，使用的是 `react-konva`。

三张设计参考图在 `docs/prototypes/`。

## 安装与运行 React 工程

要求 Node.js 20+：

```bash
cp .env.example .env.local
npm install
npm run dev
```

默认 `VITE_API_MODE=mock`，无真实请求。打开 http://127.0.0.1:5173。

如需接你的 New API 中转，在 `.env.local` 中设置：

```dotenv
VITE_API_MODE=relay
NEW_API_BASE_URL=https://你的newapi域名
NEW_API_TEST_TOKEN=你的低额度测试Token
```

随后重启 `npm run dev`。图像和聊天模型名称可在 UI 右上角设置修改。

**安全注意：** 测试 Token 只放在本地的 `.env.local`，由 Vite 开发代理注入；不要放在 `VITE_*` 变量或浏览器代码中。Vite 代理仅供本机测试，正式合并进 New API 时必须改为经过登录鉴权和额度计算的后端路由，不可公开测试代理。

**复用优先架构：** [ADR-001：现有 NewAPI 协议栈复用评估](docs/PROTOCOL_REUSE_ARCHITECTURE.zh-CN.md)（NewAPI Relay、协议互转、SSE、SDK 选型）。

## 双协议与真实模型接入规划

文生图、图片编辑、文字聊天和图片问答将提供 Chat Completions 与 Responses 两种协议选择（并保留 Images API 兼容模式）；但标准 Chat Completions 本身不提供通用图片输出，第三方 Chat 生图需验证对应供应商格式。正式启用需要 NewAPI 登录态 BFF，GitHub Pages 暂时仍为 Mock。详细设计见 [双协议图文 Playground 方案](docs/DUAL_PROTOCOL_PLAYGROUND.zh-CN.md)。

## 云端作品库与自动清理（规划中）

已确认方案 C：NewAPI 账号级云端作品集、管理员可设置图片保留天数（含永久）、到期前站内通知，以及后台自动清理。

**当前版本还没有服务端图片持久化、自动到期清理或按 NewAPI 账号隔离的云端作品集**，这些不能仅靠 GitHub Pages 或浏览器 IndexedDB 实现。实现规则和上线验收见 [云端作品集与清理设计](docs/CLOUD_GALLERY_RETENTION.zh-CN.md)。

## 重要说明

- 本次只制作了独立工程文件，**没有直接修改原来的 `new-api` 仓库**。
- 当前 GitHub 连接不支持新建仓库操作，因此本工程通过 ZIP 交付。你可以先在 GitHub 手动新建空仓库 `new-api-image-playground`，然后导入本项目。
- 当前交付环境无法连接 npm registry，因此已经验证 TypeScript 代码的语法解析，但尚未完成 `npm install`、正式 React 构建及真实上游联调。**不要直接用于生产环境**。
- 当前默认是三种显式模式，不是自动调用工具的对话 Agent；这一项可以在后续版本增加。
- 生产部署还需要图片对象存储、登录会话、限流、权限校验和稳定版本历史。

完整集成指引：`docs/INTEGRATION.md`；验收条目：`docs/ACCEPTANCE.md`。
