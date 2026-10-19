# 真实图像 API 联调

这个仓库有一个需要手动授权执行的 GitHub Actions 工作流：`.github/workflows/live-image-smoke.yml`。

## 安全配置

1. 在 New API 中创建**新的低额度、可撤销的临时测试 Token**（不要复用发到聊天或工单的密钥）。
2. 在仓库 `Settings → Secrets and variables → Actions → New repository secret` 中建立 `NEW_API_TEST_TOKEN`，填写新的 Token。
3. 任何 Token 都不得提交到仓库、Issue、PR、日志或屏幕截图。测试结束后撤销临时 Token。

## 运行

打开 `Actions → Live image API smoke test → Run workflow`，选择 `main`，勾选 `confirm_paid_calls` 后执行。

- Base URL: `https://mhapi.net/v1`
- Model: `gpt-image-2`
- 最多执行**一次文生图及一次修图**（可能计费）。
- 生成时请求 `POST /v1/images/generations`；编辑时将刚生成的图片作为 `multipart/form-data` 上传到 `POST /v1/images/edits`。
- 返回结果支持 `data[0].b64_json` 或 `data[0].url`，会校验图片魔数和字节大小。
- 本次不执行普通聊天、Mask 或多次循环修改测试。

## 看结果

打开运行记录，查看 `Generate one image and edit it once` 步骤。成功时打印 `Generation: PASS`、`Edit generated image: PASS` 和 `FULL IMAGE SMOKE TEST: PASS`。

同一运行下的 `image-smoke-output` Artifact 保存两张图片供人工对照，保留一天。若出错，只打印 HTTP 状态码和测试阶段，避免在 CI 日志泄露上游响应体。

## 常见问题

- `Missing ... Secret`：尚未设置 Secret。
- `HTTP 401/403`：测试 Token 无效、额度/权限不足或上游不接受。
- `HTTP 404`：中转地址路径或模型路由不正确。
- `HTTP 400`：模型名、图片编辑 multipart 格式或某个参数与第三方上游不兼容。
- `HTTP 429`：额度/限流配置需要检查。
- 生成成功而编辑失败：检查 `/v1/images/edits` 的上游实际协议实现，不等于前端修图功能已经通过。

**提醒**：这个 CI 只用于联通性和协议冒烟测试，并不保证模型输出符合局部选区要求；当前 Playground 没有 Mask。
