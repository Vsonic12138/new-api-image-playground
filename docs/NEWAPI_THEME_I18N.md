# New API 风格与国际化接入指南

## 独立版

- 默认浅色、可切换炭灰深色，使用独立 CSS 文件 src/newapi-skin.css；三栏布局不变。
- 单独部署时：src/i18n/standalone.ts 使用 i18next + 浏览器语言检测，并缓存语言选择。
- 7 种语言与当前 New API 一致：zhCN、en、fr、ru、ja、vi、zhTW。
- 图片 Playground 的文案都放在 imagePlayground 独立命名空间，资源在 src/i18n/resources.ts，避免与宿主原有 translation 文案冲突。
- 独立皮肤作用域限定为 .app-shell。后续集成请优先用宿主的 CSS 变量和组件。

## 集成到 New API

### 使用已有 i18next 实例，不要再次初始化

New API 的 web/src/i18n/config.ts 已经创建了 i18n；可在 image-playground 功能初始化时注册词典：

~~~ts
import i18n from '@/i18n/config'
import { imagePlaygroundTranslations } from './i18n/resources'

for (const [language, dictionary] of Object.entries(imagePlaygroundTranslations)) {
  i18n.addResourceBundle(language, 'imagePlayground', dictionary, true, true)
}
~~~

组件中直接调用 useTranslation('imagePlayground')。嵌入时不要 import src/i18n/standalone.ts，否则会和 New API 语言检测冲突。

### 语言统一跟随登录用户

New API 的 web/src/components/language-switcher.tsx 会切换全局 i18n 语言，且会在登录后用 PUT /api/user/self 持久化 language。

因此集成版本：
1. 取消 Playground 独立的语言开关；
2. 使用 New API 全局 LanguageSwitcher；
3. 页面只订阅宿主 useTranslation('imagePlayground')；
4. 语言默认由宿主账户偏好 / 浏览器决定；
5. Intl 日期格式化先将 zhCN / zhTW 映射到 zh-CN / zh-TW（已有 toIntlLocale helper）。

### 深浅主题统一由宿主管理

New API 的 web/src/styles/theme.css 和 theme-presets.css 使用 semantic tokens（background、card、border、primary、sidebar 等），ThemeProvider 会管理 html.dark 和主题预设。

集成版本：
1. 隐藏独立版深浅切换按钮及本地 theme 状态；
2. 读取宿主的主题变量，优先复用 @/components/ui/button、input、dialog 等组件；
3. 不允许 Playground 局部背景色覆盖宿主 sidebar/header 的颜色；
4. 三栏布局保持，但宿主侧栏与工作台会话侧栏应避免重复。

### API 与持久化

- 继续复用 New API 登录态、用户 Token、模型分组、价格和计费；
- 不把上游主 Key 放在客户端、仓库公开文件或者 Pages 构建环境中；
- 当前 IndexedDB 会话/图片仅适合本机 MVP；正式集成要持久化到服务端和对象存储；
- 文生图走 /v1/images/generations，整图编辑走 /v1/images/edits；
- react-konva 圈选只是提示标注，并非 Mask 精确修图；
- 当前独立版本有生图/修图/对话显式模式，自动工具路由可留待后续。
