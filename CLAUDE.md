# Claude Code 规则（中文精简版）

> 最后更新: 2026-04-10
>
> 目标：只保留高价值规则，减少上下文 token 消耗。

## 1. 事实来源优先级

1. 真实源码 > 本规则 > README/历史文档。
2. 代码冲突时，以当前可运行实现为准。
3. 当前主栈：`Nuxt 4 + Vue 3 + TypeScript + Pinia + @nuxt/ui + Tailwind CSS 4 + ECharts + Binance WS + Tauri 2 + Rust`。
4. `srcDir` 是 `src/`，前端新增代码默认放在 `src/` 下。

## 2. 不可违背规则

1. Vue 一律优先 `Composition API + <script setup lang="ts">`。
2. 分层约束：
`src/pages/*` 只做路由入口与页面装配；复杂业务放 `src/views/*`；复用 UI 放 `src/components/*`；状态与副作用放 `src/composables/*`。
3. 组件内不要直接写业务 API；走 `src/api/*` 与 `src/http/useHttp.ts`。
4. 新增用户可见文案必须走 i18n；沿用“中文原文作为 key”；同步四个语言包：`zh-CN/en-US/ar-AE/ru-RU`。
5. 浏览器 API 必须做客户端保护（`window/document/WebSocket/ResizeObserver/getComputedStyle` 等）。
6. 保持项目风格：4 空格缩进、单引号、分号。
7. 非真正跨页面共享状态，不要放 Pinia。
8. 不要随意重命名 `src/components/DeptchChart`（历史拼写，外层兼容依赖）。

## 3. 核心目录职责（压缩版）

1. `nuxt.config.ts`：Nuxt 单一配置入口（模块、i18n、runtimeConfig、构建行为）。
2. `src/http/useHttp.ts`：默认 HTTP 主链路（token/语言/错误处理）。
3. `src/api/*`：语义化业务 API 封装。
4. `src/services/runtime/*`：Web/Desktop 统一 runtime gateway。
5. `src/store/runtimeEvent.ts`：运行时事件统一分发。
6. `src/composables/useBinance*.ts`：行情流订阅与生命周期。
7. `src/composables/useSecureCredential.ts`：桌面端安全凭据读写封装。
8. `src-tauri/src/main.rs`：Rust runtime、WS 桥接、secure credential 命令实现。

## 4. 图表与行情改动规则

1. 深度图优先复用 `src/components/DeptchChart/hooks/*`，不要在页面复制一套逻辑。
2. `StreamingChart.vue`、`LineChart.vue`、`DeptchChart/index.vue` 职责不要串层。
3. 修改深度图交互（对称缩放、聚合、hover、tooltip）后，必须验证体验完整性。
4. Hover/tooltip 查询基于“当前渲染后的 series”，不要直接用原始盘口数据。

## 5. Tauri / Rust 规则

1. Rust 侧日志用 `tracing`，避免新写 `eprintln!`。
2. Rust 质量基线命令：
`yarn rust:fmt:check && yarn rust:clippy && yarn rust:check`
3. 凭据只走 keyring（`save/load/delete_secure_credential`），禁止明文落盘。
4. runtime 事件统一发到 `runtime.event` / `runtime.connection.state`，前端通过 gateway/store 消费。

## 6. 变更验证清单

1. 默认：`yarn lint`。
2. 涉及类型或 Nuxt 自动导入：`yarn typecheck`。
3. 涉及 Rust/Tauri：执行第 5 节 Rust 基线命令。
4. 涉及行情/图表/流：至少手测 `/` 与 `/spot`。
5. 涉及桌面桥接：额外冒烟 `yarn tauri:dev`。

## 7. 已知历史包袱

1. `DeptchChart` 拼写历史遗留，不是拼错后可立即改名的普通目录。
2. `src/store/index.ts` 目前主要是 Pinia 安装入口，不代表应把局部状态都塞进 store。
3. 部分页面存在历史硬编码文案，这是待清理项，不是新代码范式。
4. README 可能落后于代码树，最终以源码为准。

## 8. 推荐改法（默认流程）

1. 新功能优先走：`types` 定义契约 -> `composables` 处理状态/副作用 -> `views` 业务编排 -> `components` 展示。
2. 如已有同类工具（`hooks`/`utils`/composables），优先复用，不重复造轮子。
3. 非必要不扩展遗留分支（例如 `src/http/index.ts`）。
