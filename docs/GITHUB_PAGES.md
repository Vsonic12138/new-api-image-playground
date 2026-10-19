# GitHub Pages 在线 Mock 演示

项目可以**独立部署**。GitHub Pages 用于展示不需要密钥的前端 Mock 模式，真实的 `/v1/images/generations` 和 `/v1/images/edits` 需要另行部署安全的服务端代理，不能把 API Key 放进公开网页。

## GitHub Pages 启用步骤

1. 打开仓库 `Settings → Pages`：https://github.com/Vsonic12138/new-api-image-playground/settings/pages
2. `Build and deployment` 下把 **Source** 设置为 **GitHub Actions**，保存。
3. 打开 https://github.com/Vsonic12138/new-api-image-playground/actions/workflows/pages.yml，重跑发布任务或提交一次代码触发部署。
4. 确认发布成功后，访问 `https://vsonic12138.github.io/new-api-image-playground/`。

注意：当前仓库是 **Private**。GitHub 免费账号一般仅能为公共仓库启用 Pages；私人仓库支持范围取决于 GitHub 付费套餐及组织策略。若无法启用，建议建立一个**不包含 Token、仅含 Mock 演示**的单独公共发布仓库，避免意外公开源仓库。

## 自动发布设计

- 工作流 `.github/workflows/pages.yml` 会对 `main` 代码提交构建。
- `npm run build -- --base=/new-api-image-playground/` 适配项目路径。
- 强制 `VITE_API_MODE=mock`，默认不使用真实接口。
- Mock 图片路径兼容子目录。
- 真实 Token 仅用于私有 Actions Secret 的手动测试工作流；Pages 构建不读取它。

## 可体验内容

多轮会话界面、切换生图／修图／对话、Mock 图片卡片、上传本地图片、画笔与框选标注、图片下载、图片历史。

**请注意**：浏览器内本地保存的会话与图片只在当前浏览器有效；Mock 生图使用示例素材，不会调用真实 `gpt-image-2`。
