# Nuxt Trading Console

基于 Nuxt 4.3.1 + Nuxt UI 的现代交易控制台模板，内置多语言、暗黑模式、TradingView 行情组件与 API 封装，可直接作为行情/风控中台的起点。

## 技术栈一览

- **Nuxt 4 + Nitro 2.13**：`srcDir: src/`，设置 `compatibilityDate: 2026-03-10`，`runtimeConfig` 统一收敛内部/外部 API Base，`ColorScheme + NuxtLayout + NuxtPage` 构成页面骨架。
- **Nuxt UI + TailwindCSS 4**：通过 `@nuxt/ui` 搭建导航、指标卡、表单与通知系统（`UNotifications/UModals/USlideovers`），`appConfig.ui` 采用 `emerald/slate` 主题，样式入口为 `src/assets/stylesheet/tailwind.css`。
- **国际化**：`@nuxtjs/i18n` 搭配 `src/i18n.config.ts` 与 `src/lang/*.json`，支持中/英/阿/俄及 RTL 布局，URL 策略为 `prefix_except_default`。
- **状态与网络**：`pinia` 初始化 store；`src/http/useHttp.ts` 使用 `$fetch.create` 写入 token、语言头并统一 401/业务错误，`src/api/sys.ts` 提供登录示例；`nuxt-tradingview` 注入实时图表组件。
- **定制模块**：`src/modules/fix-nuxt-ui-imports.ts` 监听 `imports:extend`，清除 Nuxt UI 未导出的 `config/bind`，避免浏览器端 “does not provide an export named 'config'” 报错。

## 运行环境与安装

### 推荐环境

| 组件 | 最低要求 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 22.0.0 | 推荐 22 LTS（用户已升级），确保 `corepack` 可用。 |
| Corepack / npm | Corepack ≥ 0.24 | 使用 `corepack enable` 管理 Yarn 版本，避免全局安装旧版 Yarn。 |
| Yarn | Berry 4.x | 仓库使用 `yarn.lock`（Berry），执行 `yarn -v` 确认 4.x。 |
| OS & 浏览器 | macOS / Linux / Windows(WSL) + 最新 Chrome/Edge | Nuxt DevTools、Tailwind JIT 等对现代浏览器有要求。 |

### 安装步骤

1. `node -v` 确认版本 ≥ 22，必要时借助 `nvm`/`fnm` 切换。
2. 执行 `corepack enable && corepack prepare yarn@stable --activate` 激活 Yarn Berry。
3. 在仓库根目录运行 `yarn install` 安装依赖；首次安装会自动执行 `postinstall -> nuxt prepare` 生成 `.nuxt` 类型文件。
4. 根据部署环境导出配置：
   - `NUXT_PUBLIC_APP_BASE`：应用根路径，默认为 `/`，部署到子路径时需要修改。
   - `NUXT_PUBLIC_API_BASE`：对外 API 域名，默认为 `http://8.218.199.96:10002`。
   - `NUXT_COMPATIBILITY_DATE`（可选）：覆盖 Nitro `compatibilityDate`，对 edge/serverless 平台有帮助。

## 构建与运行

| 命令 | 场景 | 产物 / 说明 |
| --- | --- | --- |
| `yarn dev` | 本地调试，默认 `http://localhost:3000` | 可配合 `--host` 暴露局域网，自动启用 Vite HMR 与 Nuxt DevTools。 |
| `yarn build` | 生产构建 | 生成 `.output/` Nitro 服务器（Node 适配器），可由 PM2/Docker 直接启动。 |
| `yarn preview` | 验证构建结果 | 使用 Nitro 模式启动 `.output/`，模拟线上运行。 |
| `yarn generate` | 静态托管或混合渲染 | 额外输出 `dist/`，保留 SSR 功能需结合 Nitro 适配器。 |
| `yarn tauri:dev` | 桌面端开发 | 启动 Tauri 开发模式，自动拉起 Nuxt Dev Server（`127.0.0.1:1420`）。 |
| `yarn tauri:build` | 桌面端打包 | 生成桌面安装包（需先配置签名/图标/更新通道）。 |
| `yarn lint` / `yarn lint:fix` | 规范检查 | 依赖 `@nuxt/eslint-config`，提交前可配合 `lint-staged` 自动修复。 |
| `npx nuxt typecheck` | `vue-tsc` 类型校验 | 补充编译期 TS 安全，推荐在 CI 中执行。 |

> 打包产物推荐以 `.output/` 为准；若部署到 Vercel/Cloudflare，可通过 `NITRO_PRESET` 切换适配器或者直接使用平台默认检测。

## Tauri Desktop 说明

- 桌面壳目录在 `src-tauri/`，当前已提供最小可运行配置（窗口、命令桥、事件桥）。
- Web 与 Desktop 发布链路分离：
  - Web：`yarn build` / `yarn generate`
  - Desktop：`yarn tauri:dev` / `yarn tauri:build`
- Desktop 运行时桥接 composable：`src/composables/useRuntimeBridge.ts`
- 统一运行时网关基础层：`src/services/runtime/`（WebSocket 直连 + Desktop 事件桥适配）
- Rust Runtime 已支持 `runtime_subscribe/runtime_unsubscribe/runtime_disconnect_all`，可托管 Binance WS 并向前端发出 `runtime.event`。
- 前端 Runtime 统一分发 Store：`src/store/runtimeEvent.ts`
- Desktop 凭据安全存储封装：`src/composables/useSecureCredential.ts`（Rust keyring 命令桥接）

### Rust 代码规范（已落地）

- **格式化**：`src-tauri/rustfmt.toml` 统一 Rust 格式约定，使用 `yarn rust:fmt` / `yarn rust:fmt:check` 执行。
- **静态检查**：`src-tauri/Cargo.toml` 中已启用 `lints.rust + lints.clippy` 基线，重点约束 `unsafe_code`、`unused_must_use`、`redundant_clone` 等问题。
- **结构化日志**：引入 `tracing + tracing-subscriber`，Rust runtime 从 `eprintln!` 升级为结构化日志，便于后续接入文件日志/观测平台。
- **建议 CI 命令**：`yarn rust:fmt:check && yarn rust:clippy && yarn rust:check`

## 目录总览

> 通过 `python3` 遍历生成，已忽略 `node_modules`、`.nuxt`、`.git` 等体积目录，方便在 README 中阅读。

```
.
├── README.md
├── package.json
├── nuxt.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── repack.config.cjs
├── commitlint.config.cjs
├── docs/
│   └── plans/
│       └── 2026-03-06-nuxt-ui-migration.md
├── .husky/
│   └── _/…（git 钩子）
├── src/
│   ├── app.vue
│   ├── i18n.config.ts
│   ├── api/
│   │   └── sys.ts
│   ├── assets/
│   │   ├── stylesheet/main.css
│   │   ├── styles/base.css
│   │   └── tailwind.css
│   ├── components/
│   │   ├── Header.vue
│   │   └── Footer.vue
│   ├── composables/
│   │   └── useMessage.ts
│   ├── filters/
│   │   ├── dataThousands.ts
│   │   └── dateFormat.ts
│   ├── http/
│   │   ├── index.ts
│   │   └── useHttp.ts
│   ├── lang/
│   │   ├── ar-AE.json
│   │   ├── en-US.json
│   │   ├── ru-RU.json
│   │   └── zh-CN.json
│   ├── layouts/
│   │   └── default.vue
│   ├── middleware/
│   │   └── setup.global.ts
│   ├── modules/
│   │   └── fix-nuxt-ui-imports.ts
│   ├── pages/
│   │   ├── index.vue
│   │   └── login.vue
│   ├── public/
│   │   └── favicon.png
│   ├── server/
│   │   └── tsconfig.json
│   ├── store/
│   │   └── index.ts
│   ├── utils/
│   │   ├── common.ts
│   │   ├── constant.ts
│   │   ├── copyToClipboard.ts
│   │   └── dayjs.ts
│   ├── vue-shim.d.ts
│   └── views/（预留目录）
└── yarn.lock
```

## 目录详解

| 路径 | 类型 | 说明 |
| --- | --- | --- |
| `nuxt.config.ts` | 核心配置 | 统一设置 `compatibilityDate`、`runtimeConfig`、模块列表、`colorMode` 与 Vite 代理。 |
| `tailwind.config.ts` | 样式配置 | 定义 content globs，与 Nuxt UI 主题共同驱动 Tailwind JIT。 |
| `tsconfig.json` / `src/server/tsconfig.json` | TypeScript | 根配置扩展 Nuxt 生成的别名，server 端引用 `.nuxt/tsconfig.server.json`。 |
| `repack.config.cjs` | 文案抽取 | `reepack` 用于提取 `<i18n>` 区块，输出 `nuxt3_output/*.yml` 以便翻译协作。 |
| `commitlint.config.cjs` + `.husky/` | 工具链 | 约束提交信息、触发 `lint-staged`，保持 Git 历史一致。 |
| `docs/plans/2026-03-06-nuxt-ui-migration.md` | 文档 | 记录 Nuxt UI 迁移计划，可追溯需求拆分。 |
| `src/app.vue` | 应用骨架 | `<ColorScheme>` 包裹 `<NuxtLayout>` 与 `<NuxtPage>`，使用 `renderKey` 在语言/主题切换时强制刷新，并注册 `UNotifications/UModals/USlideovers`。 |
| `src/layouts/default.vue` | 全局布局 | Header + Footer + `<main>` 容器，负责页面级留白与背景。 |
| `src/components/Header.vue` | 封装组件 | 使用 Nuxt UI 构建导航栏、语言下拉、主题切换与 CTA；通过 `useColorMode` 与 `useI18n` 同步状态。 |
| `src/components/Footer.vue` | 封装组件 | 展示版权与外链，基于 Nuxt UI `UContainer`/`ULink`。 |
| `src/pages/index.vue` | 页面 | 首页（指标卡 + TradingView 图表 + 更新列表），根据 `colorMode` 切换图表主题。 |
| `src/pages/login.vue` | 页面 | `UForm` 登录表单，内置本地校验与 `useMessage` Toast，成功后写入 `token` Cookie 并跳转。 |
| `src/lang/*.json` | 语言包 | header/footer/home/login 四大命名空间，支持 RTL（`ar-AE`）。 |
| `src/i18n.config.ts` | i18n 配置 | 声明 `locales`、默认语言、浏览器语言探测与 `bundle.optimizeTranslationDirective=false`。 |
| `src/middleware/setup.global.ts` | 全局路由守卫 | 根据 `to.meta.requiresAuth` 和 `token` Cookie 控制访问权限。 |
| `src/modules/fix-nuxt-ui-imports.ts` | Nuxt 模块 | 运行期删除 `@nuxt/ui/dist/runtime/composables/useFormGroup` 中无效导入，修复浏览器控制台错误。 |
| `src/composables/useMessage.ts` | 组合式工具 | 对 `useToast()` 进行封装，暴露 `success/error/warning/info`。 |
| `src/http/useHttp.ts` | 网络层 | 基于 `$fetch.create` 注入 token、语言与错误提示，暴露 `get/post/put/delete`。 |
| `src/http/index.ts` | 轻量封装 | 以 `useFetch` 实现的通用请求类，可在需要的地方替换 `$fetch`。 |
| `src/api/sys.ts` | API SDK | 登录接口示例，演示如何复用 `http.post`。 |
| `src/utils/common.ts` | 工具函数 | 数字转中文、数组随机、URL encode、剪贴板处理等通用逻辑，依赖 `SIX_NUMBER` 与 `useMessage`。 |
| `src/utils/constant.ts` | 常量 | 统一维护正则、分页默认值等常量。 |
| `src/filters/dataThousands.ts`、`src/filters/dateFormat.ts` | 自定义过滤器 | 兼容 Vue 2 Filter API，提供千分位与时间格式化。 |
| `src/assets/stylesheet/main.css` / `src/assets/styles/base.css` | 全局样式 | 定义基础排版、渐变背景与 reset 规则。 |
| `src/assets/stylesheet/tailwind.css` | Tailwind 入口 | 通过 `@import "tailwindcss"` 注入 Tailwind 4 样式层。 |
| `src/public/favicon.png` | 静态资源 | 通过 `app.head.link` 载入的 favicon。 |
| `src/store/index.ts` | Pinia 实例 | 输出 `createPinia()`，由 Nuxt 自动注册。 |
| `src/vue-shim.d.ts` | 类型补丁 | 兼容遗留的 Element Plus Locale 导入（后续可移除）。 |
| `src/server/tsconfig.json` | 服务器类型 | 复用 `.nuxt` 生成文件，保证 server bindings。 |
| `src/views/` | 业务视图 | 承载首页图表与 `spot` 交易台等组合式页面。 |
| `.idea/` | IDE 元数据 | JetBrains 项目配置，不参与构建，仅供开发者本地使用。 |

## 样式策略

- `src/assets/stylesheet/main.css` 设置字体、全局背景与链接状态，`src/assets/styles/base.css` 处理基础 reset。
- Tailwind 样式入口位于 `src/assets/stylesheet/tailwind.css`，通过 `@import "tailwindcss"` 注入 Tailwind 4 能力。

## 下一步

- 在 `PROJECT_DETAILS.md` 按需补充业务描述、接口约定、部署方式。
- 若需要更多组件或图表，优先复用 Nuxt UI，并保持 Tailwind 4 的配置与文档同步更新。
