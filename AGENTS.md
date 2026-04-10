# Codex / CodeX Rules

> Last updated / 最后更新: 2026-04-02
>
> This file is the repository-level instruction set for Codex / CodeX agents.
> 本文件是提供给 Codex / CodeX agent 的仓库级规则说明。

## 1. Source Of Truth / 事实来源优先级

- CN: 真实源码优先于 README、历史计划文档和旧规则；如果文档与代码冲突，以当前源码为准。
- EN: Real source code overrides README, old plan docs, and historical rules; if docs conflict with code, trust the current implementation.
- CN: 本仓库当前是 `Nuxt 4 + Vue 3 + TypeScript + Pinia + @nuxt/ui + Tailwind CSS 4 + ECharts + Binance WebSocket composables`。
- EN: The current stack is `Nuxt 4 + Vue 3 + TypeScript + Pinia + @nuxt/ui + Tailwind CSS 4 + ECharts + Binance WebSocket composables`.
- CN: `srcDir` 是 `src/`，因此新增页面、组件、布局、语言包、middleware 时都要放在 `src/` 下。
- EN: `srcDir` is `src/`, so new pages, components, layouts, locale files, and middleware must live under `src/`.

## 2. Non-Negotiable Rules / 不可违背的规则

- CN: 默认使用 Vue 3 Composition API 和 `<script setup lang="ts">`；不要引入 Options API 风格的新代码。
- EN: Default to Vue 3 Composition API with `<script setup lang="ts">`; do not add new Options API style code.
- CN: 页面层要薄。`src/pages/*` 负责路由入口，复杂业务组合放到 `src/views/*`，可复用 UI 放到 `src/components/*`，状态副作用放到 `src/composables/*`。
- EN: Keep route pages thin. `src/pages/*` is for route entry, complex feature composition belongs in `src/views/*`, reusable UI belongs in `src/components/*`, and stateful side effects belong in `src/composables/*`.
- CN: 组件里不要直接写业务 API 请求。接口调用必须优先经过 `src/api/*` 和 `src/http/useHttp.ts`。
- EN: Do not put business API calls directly in components. API access should go through `src/api/*` and `src/http/useHttp.ts`.
- CN: 所有新增用户可见文案必须走 i18n；当前项目使用“中文原文作为 key”的扁平结构，新增 key 时必须同步四个语言文件。
- EN: All new user-facing text must use i18n; this project currently uses flat Chinese source strings as keys, and every new key must be added to all four locale files.
- CN: 不要把跨页面共享状态随意塞进 Pinia；只有真正跨页面、跨布局、跨模块共享的状态才进入 store。
- EN: Do not move state into Pinia casually; only truly cross-page, cross-layout, or cross-feature shared state belongs in store.
- CN: 浏览器 API 必须做客户端保护，例如 `window`、`document`、`WebSocket`、`ResizeObserver`、`getComputedStyle`。
- EN: Browser APIs must be guarded for client-only execution, such as `window`, `document`, `WebSocket`, `ResizeObserver`, and `getComputedStyle`.
- CN: 保持现有代码风格：4 空格缩进、单引号、强制分号、Vue 模板 4 空格缩进。
- EN: Preserve the existing style: 4-space indentation, single quotes, required semicolons, and 4-space Vue template indentation.
- CN: 修改深度图时优先复用现有 hooks，不要在 `index.vue` 里复制一套新的 hover、resample、ECharts option 逻辑。
- EN: When editing the depth chart, reuse the existing hooks instead of duplicating hover, resampling, or ECharts option logic inside `index.vue`.
- CN: 不要轻易重命名 `src/components/DeptchChart` 目录；虽然拼写历史遗留，但当前有兼容包装层依赖它。
- EN: Do not casually rename `src/components/DeptchChart`; the misspelling is historical, but the current compatibility wrapper depends on it.

## 3. Verification Commands / 验证命令

- CN: 提交前至少运行 `yarn lint`；涉及类型、Nuxt 自动导入、SFC props/emits 时再运行 `npx nuxt typecheck`。
- EN: Run `yarn lint` before finishing; also run `npx nuxt typecheck` when the change affects typing, Nuxt auto-imports, or SFC props/emits.
- CN: 如果你改了图表、hover、WebSocket 相关逻辑，要额外检查首页 `/` 和现货页 `/spot` 是否都还能工作。
- EN: If you touch chart, hover, or WebSocket logic, also verify both the home page `/` and the spot page `/spot`.

## 4. Root File Responsibilities / 根目录与核心配置职责

| Path | 中文说明 | English Guidance |
| --- | --- | --- |
| `package.json` | 项目脚本与依赖入口；当前包管理实际以 `yarn` 命令为主。 | Entry point for scripts and dependencies; this repo currently uses `yarn` commands in practice. |
| `nuxt.config.ts` | 核心配置中心，管理 `srcDir`、别名、`runtimeConfig`、自动导入目录、模块、i18n、color mode、Vite 代理。 | Central Nuxt config for `srcDir`, aliases, `runtimeConfig`, auto-import dirs, modules, i18n, color mode, and Vite proxy rules. |
| `tailwind.config.ts` | Tailwind 主题扩展与扫描配置；当前是偏交易终端风格的 token 化颜色映射。 | Tailwind theme extension and content scanning; currently tuned for a trading-console tokenized palette. |
| `tsconfig.json` | 扩展 `.nuxt/tsconfig.json`，让 Nuxt 生成类型、`types/**/*.d.ts` 和 `src/**/*` 一起参与类型检查。 | Extends `.nuxt/tsconfig.json` so generated Nuxt types, `types/**/*.d.ts`, and `src/**/*` all participate in type checking. |
| `eslint.config.mjs` | ESLint Flat Config，定义项目代码风格与宽松/严格边界，是 lint 的实际来源。 | ESLint Flat Config; defines the real lint behavior and style boundaries for this repo. |
| `.editorconfig` | 基础编辑器格式约定：UTF-8、LF、4 空格。 | Base editor formatting rules: UTF-8, LF, 4 spaces. |
| `.prettierrc.cjs` | Prettier 输出风格，和 ESLint 风格保持一致。 | Prettier formatting config aligned with ESLint expectations. |
| `.lintstagedrc` | Git 暂存文件级别的 `eslint --fix` 与 `prettier --write`。 | Staged-file automation for `eslint --fix` and `prettier --write`. |
| `commitlint.config.cjs` | Git 提交信息规范。 | Commit message conventions. |
| `.env`, `.env.development`, `.env.production` | 遗留 Vite 风格环境变量；当前 Nuxt 真正使用的是 `NUXT_PUBLIC_*` / `NUXT_INTERNAL_*`。不要把这里当作唯一配置来源。 | Legacy Vite-style env files; current Nuxt runtime really uses `NUXT_PUBLIC_*` / `NUXT_INTERNAL_*`. Do not treat these files as the single source of configuration. |
| `README.md` | 项目介绍与运行说明，但部分结构描述可能落后于真实代码。 | Project overview and setup instructions, but some structure notes may lag behind the actual code. |
| `docs/plans/*` | 历史改造计划与迁移文档，只能作为背景，不是运行时约束。 | Historical migration/plan documents; useful as background only, not as runtime truth. |
| `i18n/i18n.config.ts` | 对 `src/i18n.config.ts` 的 re-export 兼容层。 | Re-export shim that points to `src/i18n.config.ts`. |

## 5. Directory Responsibilities / 目录职责

| Path | 中文说明 | English Guidance |
| --- | --- | --- |
| `src/App.vue` | 应用根壳，负责 `ColorScheme`、`UApp`、`NuxtLayout`、`NuxtPage` 装配，并通过 `renderKey` 绑定语言/主题刷新。 | Root app shell that wires `ColorScheme`, `UApp`, `NuxtLayout`, and `NuxtPage`, and uses `renderKey` to refresh on locale/theme changes. |
| `src/api/` | 业务 API 方法层；这里的函数应该表达业务语义，而不是重复写 HTTP 细节。 | Business API method layer; functions here should express domain intent instead of raw HTTP details. |
| `src/assets/stylesheet/` | 全局 CSS、主题 token、Tailwind 入口。 | Global CSS, theme tokens, and the Tailwind entrypoint. |
| `src/components/` | 可跨页面复用的通用组件。 | Reusable cross-page UI components. |
| `src/components/OrderBook/` | 通用订单簿组件的内部 hook 区，负责将盘口原始数据转成稳定渲染槽位。 | Internal hook area for the generic order book, responsible for converting raw book data into stable render slots. |
| `src/components/DeptchChart/` | 深度图主实现目录，包含主组件与 ECharts/hover/series hooks。 | Main implementation directory for the depth chart, including the component and all ECharts/hover/series hooks. |
| `src/composables/` | 组合式逻辑中心，承载 WebSocket 流、Toast 封装等可复用状态与副作用。 | Home of reusable composables, including WebSocket streams, toast wrappers, and other stateful side effects. |
| `src/filters/` | 旧式“过滤器”兼容工具，核心价值其实是格式化函数本身。 | Legacy filter-compat helpers whose real value is the formatting functions they expose. |
| `src/http/` | HTTP 抽象层；`useHttp.ts` 是当前主链路，`index.ts` 是遗留备用实现。 | HTTP abstraction layer; `useHttp.ts` is the primary path, while `index.ts` is a legacy alternative. |
| `src/lang/` | 四种语言的 JSON 语言包；当前 key 采用扁平中文短语。 | Four locale JSON bundles; keys are currently flat Chinese phrases. |
| `src/layouts/` | 页面布局层；`default` 用于常规页，`trade` 用于更紧凑的交易页。 | Layout layer; `default` is for standard pages, `trade` is for the denser trading interface. |
| `src/middleware/` | 全局路由中间件。 | Global route middleware. |
| `src/modules/` | Nuxt 自定义模块；当前用于修复 Nuxt UI 导入问题。 | Custom Nuxt modules; currently used to patch Nuxt UI import issues. |
| `src/pages/` | 路由文件入口；不要在这里堆积复杂业务实现。 | Route entry files; do not pile full business implementations here. |
| `src/public/` | 静态资源目录。 | Static asset directory. |
| `src/server/` | 当前只有 server 端 tsconfig，占位性质，尚未承载实际 Nitro API。 | Currently only contains server tsconfig; acts as a placeholder rather than a real Nitro API module. |
| `src/store/` | Pinia 安装入口；当前没有成熟的领域 store。 | Pinia installation entry; there are no mature domain stores yet. |
| `src/utils/` | 通用工具函数与常量；注意这里混有历史遗留工具，使用前要判断是否真的适合当前架构。 | Shared utility functions and constants; note that some are legacy helpers and should be evaluated before reuse. |
| `src/views/home/` | 首页专用图表视图组件。 | Home-page-specific chart view components. |
| `src/views/spot/` | 现货交易功能视图层，页面组合与数据编排中心。 | Spot trading feature view layer, where page composition and orchestration happen. |
| `src/views/spot/components/` | 现货页私有子组件，不应默认抽成全局组件。 | Private subcomponents for the spot page; do not globalize them by default. |
| `types/` | 跨目录共享的 TypeScript 类型定义。 | Shared TypeScript type definitions across directories. |

## 6. Route, View, and Component Map / 页面、视图与组件地图

| Path | 中文说明 | English Guidance |
| --- | --- | --- |
| `src/layouts/default.vue` | 标准站点布局，包含公共 Header、Footer 和宽内容容器。 | Standard site layout with shared header, footer, and a constrained content container. |
| `src/layouts/trade.vue` | 交易页布局，更紧凑，保留 Header，去掉 Footer。 | Tighter trading layout that keeps the header and removes the footer. |
| `src/pages/index.vue` | 首页装配层，连接通用订单簿、深度图、实时 K 线、延迟折线图。 | Home-page composition layer wiring the generic order book, depth chart, live Kline, and latency chart. |
| `src/pages/login.vue` | 登录页，负责表单校验、登录 API 调用、token cookie 写入与跳转。 | Login page that owns form validation, login API usage, token cookie storage, and redirect behavior. |
| `src/pages/spot/index.vue` | 现货交易路由入口，只负责标题与 `trade` 布局挂载。 | Spot-trading route entry that mainly sets the page title and uses the `trade` layout. |
| `src/components/Header.vue` | 顶部导航，集成语言切换、主题切换、登录/交易入口、文档方向控制。 | Top navigation with locale switching, theme switching, auth/spot entry buttons, and document-direction handling. |
| `src/components/Footer.vue` | 通用页脚，承载文案与外部链接。 | Shared footer with copy and external links. |
| `src/components/OrderBook.vue` | 通用订单簿组件，支持显示档位、选价回填、中心价动态颜色与买卖量对比条。 | Generic order-book component with depth levels, price selection emit, center-price tone changes, and buy/sell ratio bars. |
| `src/components/DepthChart.vue` | 兼容包装层，向外维持稳定组件入口，内部转发到 `DeptchChart/index.vue`。 | Compatibility wrapper that preserves a stable public entry while delegating to `DeptchChart/index.vue`. |
| `src/views/home/StreamingChart.vue` | 基于 `useBinanceKlineStream` 的 TradingView 嵌入图表壳。 | TradingView wrapper powered by `useBinanceKlineStream`. |
| `src/views/home/LineChart.vue` | 使用 ECharts 的轻量趋势折线图，按主题 token 切换颜色。 | Lightweight ECharts trend chart that adapts to theme tokens. |
| `src/views/spot/SpotTrading.vue` | 现货交易主编排组件，连接市场列表、盘口、K 线/深度图、下单表单、订单面板。 | Main spot-trading orchestrator that wires market list, order book, Kline/depth chart, order form, and orders panel. |
| `src/views/spot/SpotCatalog.vue` | 现货目录搜索页，当前是静态数据占位的筛选界面。 | Spot catalog search page, currently a filter UI backed by static placeholder data. |
| `src/views/spot/components/TradingHeader.vue` | 当前交易对摘要条。 | Current pair summary header. |
| `src/views/spot/components/ChartPanel.vue` | 交易页图表面板，在 `StreamingChart` 与 `DepthChart` 之间切换。 | Trading chart panel that switches between `StreamingChart` and `DepthChart`. |
| `src/views/spot/components/MarketList.vue` | 右侧交易对列表与搜索。 | Pair list and search panel. |
| `src/views/spot/components/OrderBook.vue` | 交易页专用简化盘口视图，不等同于通用 `src/components/OrderBook.vue`。 | Simplified spot-page order book; not the same as the reusable `src/components/OrderBook.vue`. |
| `src/views/spot/components/LatestPriceRow.vue` | 最新成交价闪烁反馈条。 | Animated latest-price row with flash feedback. |
| `src/views/spot/components/TradeList.vue` | 最新成交/我的成交切换列表。 | Tabbed list for latest trades and user trades. |
| `src/views/spot/components/OrderForm.vue` | 下单面板 UI，当前只负责输入与事件抛出，还未接真实下单接口。 | Order-entry UI that currently handles inputs and emits events, but is not yet wired to a real order API. |
| `src/views/spot/components/OrdersPanel.vue` | 当前委托、历史委托、成交历史、资产信息切换面板。 | Switchable panel for open orders, order history, trade history, and asset data. |
| `src/views/spot/components/MarketMoves.vue` | 市场异动占位卡片。 | Placeholder market-moves card. |

## 6.1 Infrastructure Support Files / 基础支撑文件

| Path | 中文说明 | English Guidance |
| --- | --- | --- |
| `src/i18n.config.ts` | i18n 真正配置入口，导入四个语言包、计算 fallback locale，并启用 composition API 模式。 | The real i18n config entry, importing four locale bundles, computing the fallback locale, and enabling composition API mode. |
| `src/middleware/setup.global.ts` | 全局鉴权中间件，基于 `token` cookie 和 `to.meta.requiresAuth` 做登录拦截。 | Global auth middleware that checks the `token` cookie and `to.meta.requiresAuth`. |
| `src/modules/fix-nuxt-ui-imports.ts` | Nuxt 自定义补丁模块，移除 Nuxt UI 某些无效导入，防止运行时报错。 | Custom Nuxt patch module that removes invalid Nuxt UI imports to prevent runtime errors. |
| `src/store/index.ts` | Pinia 注册入口，当前只导出 `createPinia()` 实例。 | Pinia registration entry that currently only exports the `createPinia()` instance. |
| `src/server/tsconfig.json` | server 侧 TypeScript 配置，占位并对齐 Nuxt 生成的 server tsconfig。 | Server-side TypeScript config that acts as a placeholder and aligns with Nuxt-generated server tsconfig. |
| `types/nuxt.d.ts` | Nuxt、i18n、自动导入与组件声明的类型引用汇总。 | Central reference file for Nuxt, i18n, auto-import, and component type declarations. |
| `src/vue-shim.d.ts` | 历史 Element Plus locale 模块声明补丁；只有在清理遗留依赖时才应动它。 | Legacy module declarations for Element Plus locales; only touch it when cleaning up old dependency remnants. |

## 7. Shared APIs and Reusable Exports / 公共方法与导出接口

### 7.1 API and Network / API 与网络层

| Export | Path | 中文说明 | English Guidance |
| --- | --- | --- | --- |
| `login(params)` | `src/api/sys.ts` | 登录 API 封装，走 `http.post('/sys/login')`。 | Login API wrapper using `http.post('/sys/login')`. |
| `http.get/post/put/delete` | `src/http/useHttp.ts` | 当前主 HTTP 客户端，自动注入 `token`、`lang`、`baseURL`，统一处理 401 和响应结构。 | Primary HTTP client that injects `token`, `lang`, and `baseURL`, and normalizes 401/error handling. |
| `httpRequest.request/get/post/put/delete` | `src/http/index.ts` | 遗留 `useFetch` 版本请求类；只有在明确维护旧链路时才用它。 | Legacy `useFetch` request wrapper; use it only when intentionally maintaining the old path. |

### 7.2 Composables / 组合式函数

| Export | Path | 中文说明 | English Guidance |
| --- | --- | --- | --- |
| `useMessage()` | `src/composables/useMessage.ts` | Toast 封装，返回 `success/error/warning/info`。默认标题仍是中文，属于历史行为，不要把它当成新文案规范。 | Toast wrapper returning `success/error/warning/info`. Its default titles are still Chinese and should be treated as legacy behavior, not as a new copy standard. |
| `useBinanceTradeStream(options)` | `src/composables/useBinanceTradeStream.ts` | 订阅 Binance 成交流，产出 `lastPrice`、`side`、`isConnected`、`symbol`。 | Binance trade-stream composable exposing `lastPrice`, `side`, `isConnected`, and `symbol`. |
| `useBinanceDepthStream(options)` | `src/composables/useBinanceDepthStream.ts` | 订阅 Binance 深度流，支持 `level/speed/mode/limit`，内部会拉快照并合并 diff 事件。 | Binance depth-stream composable with `level/speed/mode/limit`, including snapshot loading and diff-event merging. |
| `useBinanceKlineStream(options)` | `src/composables/useBinanceKlineStream.ts` | 订阅 Binance K 线流，维护 `candles`、`lastPrice`、`isConnected`。 | Binance Kline-stream composable maintaining `candles`, `lastPrice`, and `isConnected`. |

### 7.3 Filters / 格式化函数

| Export | Path | 中文说明 | English Guidance |
| --- | --- | --- | --- |
| `dataThousands(value)` | `src/filters/dataThousands.ts` | 千分位格式化。 | Thousands-separator formatter. |
| `timeStampToDate(timeStamp, reg)` | `src/filters/dateFormat.ts` | 基于 dayjs 的时间戳格式化。 | Dayjs-based timestamp formatter. |

### 7.4 Utility Functions / 通用工具函数

| Export | Path | 中文说明 | English Guidance |
| --- | --- | --- | --- |
| `getGlobalI18nText(val)` | `src/utils/common.ts` | 直接通过全局 i18n 实例翻译字符串。 | Translates a string directly through the global i18n instance. |
| `numberToChinese(numberInput)` | `src/utils/common.ts` | 数字转中文数字文本。 | Converts a number into Chinese numerals. |
| `shuffleArray(array)` | `src/utils/common.ts` | 打乱数组顺序。 | Returns a shuffled array copy. |
| `decodeHTMLEntities(encodedString)` | `src/utils/common.ts` | HTML 实体解码。 | Decodes HTML entities. |
| `handlePaste()` | `src/utils/common.ts` | 从剪贴板读取 6 位数字验证码；依赖浏览器权限与 `SIX_NUMBER`。 | Reads a 6-digit code from the clipboard; depends on browser permissions and `SIX_NUMBER`. |
| `hideMiddleText(input)` | `src/utils/common.ts` | 长字符串中间脱敏。 | Masks the middle section of a long string. |
| `deepCopy(obj, cache)` | `src/utils/common.ts` | 带循环引用缓存的深拷贝。 | Deep-copy helper with circular-reference cache support. |
| `addEventListener(el, event, handler, options)` | `src/utils/common.ts` | 带旧 IE 分支的原生监听包装。 | Native event-listener wrapper with legacy IE branches. |
| `removeEventListener(el, event, handler, options)` | `src/utils/common.ts` | 带旧 IE 分支的监听移除包装。 | Native listener removal wrapper with legacy IE branches. |
| `isPromise(val)` | `src/utils/common.ts` | 判断对象是否具备 Promise 形态。 | Checks whether a value behaves like a Promise. |
| `randomString(len)` | `src/utils/common.ts` | 生成去除易混淆字符的随机字符串。 | Generates a random string excluding ambiguous characters. |
| `urlEncode(clearString)` | `src/utils/common.ts` | 自定义 URL 编码函数。 | Custom URL-encoding helper. |
| `typeOf(obj)` | `src/utils/common.ts` | 更细粒度的运行时类型判断。 | Finer-grained runtime type inspection. |
| `toCapital(n)` | `src/utils/common.ts` | 数字转中文大写读法。 | Converts digits into Chinese uppercase-style reading. |
| `hyphenate(str)` | `src/utils/common.ts` | 驼峰转短横线。 | Converts camelCase to kebab-case. |
| `sliceLength(arr, startIndex, length)` | `src/utils/common.ts` | 按起点和长度切片。 | Slices by start index and length. |
| `buildTree(array, childrenKey, key, parentKey)` | `src/utils/common.ts` | 把平铺数组转换成树结构。 | Converts a flat array into a tree structure. |
| `makeFilterItemKey(array, key, filters, callback)` | `src/utils/common.ts` | 递归筛选/映射树状数据字段。 | Recursively filters/maps fields in tree-shaped data. |
| `numberSeparation(num, separator)` | `src/utils/common.ts` | 自定义分隔符的数字分组展示。 | Formats a number using a custom thousands separator. |
| `debounceFunc(fn, time)` | `src/utils/common.ts` | 防抖包装。 | Debounce wrapper. |
| `throttleFunc(fn, time)` | `src/utils/common.ts` | 节流包装。 | Throttle wrapper. |
| `onCopyCode(val)` | `src/utils/common.ts` | 复制文本的轻量包装。 | Lightweight wrapper for copying text. |
| `copyToClipboard(text)` | `src/utils/copyToClipboard.ts` | 通过隐藏 input 和 `document.execCommand('copy')` 实现复制。 | Clipboard helper using a hidden input and `document.execCommand('copy')`. |
| `THEME_FALLBACKS` | `src/utils/themeTokens.ts` | 供图表/SSR 读取的主题兜底色。 | Theme color fallbacks used by charts and SSR-safe runtime code. |

### 7.5 Constants and Types / 常量与类型

| Export | Path | 中文说明 | English Guidance |
| --- | --- | --- | --- |
| `NUMBER_MAX/NUMBER_MIN/...` | `src/utils/constant.ts` | 常用数值、正则、分页默认值常量。 | Shared numeric limits, regexes, and default paging constants. |
| `PagingDefaultConf` | `src/utils/constant.ts` | 分页配置默认值对象。 | Default paging configuration object. |
| `PairItem / TradeItem / OrderItem / TradeHistoryItem / AssetItem` | `types/spotTypes.ts` | 现货页共享业务类型。 | Shared business types for the spot feature. |
| `DepthPoint / DepthSeriesItem / LatestSeries` | `src/components/DeptchChart/hooks/depthChartTypes.ts` | 深度图渲染层共享类型。 | Shared rendering types for the depth chart. |

### 7.6 Order Book and Depth Chart Hooks / 订单簿与深度图 hooks

| Export | Path | 中文说明 | English Guidance |
| --- | --- | --- | --- |
| `useOrderBookRows(bids, asks, options)` | `src/components/OrderBook/hooks/useOrderBookRows.ts` | 把原始买卖盘转换成固定高度槽位，并用 `requestAnimationFrame` 批量更新。 | Converts raw bid/ask arrays into fixed-height slot rows and batches updates with `requestAnimationFrame`. |
| `formatNumber(value, fractionDigits)` | `src/components/DeptchChart/hooks/depthChartUtils.ts` | 深度图数字格式化基础函数。 | Base number formatter for depth-chart utilities. |
| `withUnit(value, fractionDigits, unit)` | `src/components/DeptchChart/hooks/depthChartUtils.ts` | 为数值附加单位。 | Adds a unit suffix to a formatted number. |
| `toRgba(color, alpha)` | `src/components/DeptchChart/hooks/depthChartUtils.ts` | 把颜色转成带透明度的 RGBA。 | Converts a color into RGBA with alpha. |
| `resolveCssVarColor(color, fallback)` | `src/components/DeptchChart/hooks/depthChartUtils.ts` | 解析 CSS 变量颜色，兼顾 SSR fallback。 | Resolves CSS variable colors with SSR-safe fallback behavior. |
| `smoothValue(prev, next, alpha)` | `src/components/DeptchChart/hooks/depthChartUtils.ts` | 基础指数平滑。 | Basic exponential smoothing. |
| `smoothValueAsymmetric(prev, next, alphaUp, alphaDown)` | `src/components/DeptchChart/hooks/depthChartUtils.ts` | 上涨/下跌使用不同平滑强度。 | Applies asymmetric smoothing for upward vs downward movement. |
| `useDepthChartMarket(options)` | `src/components/DeptchChart/hooks/useDepthChartMarket.ts` | 解析深度数据并计算 `bestBid/bestAsk/midPrice/spread/spreadPct`。 | Parses depth lists and computes `bestBid/bestAsk/midPrice/spread/spreadPct`. |
| `useDepthChartSeries(options)` | `src/components/DeptchChart/hooks/useDepthChartSeries.ts` | 负责聚合、重采样、累计曲线、平滑和 `yAxis` 量程计算。 | Handles aggregation, resampling, cumulative curves, smoothing, and `yAxis` range calculation. |
| `useDepthChartOptions(options)` | `src/components/DeptchChart/hooks/useDepthChartOptions.ts` | 生成 ECharts 基础配置和买卖盘 series。 | Builds shared ECharts options and buy/sell series definitions. |
| `useDepthChartHover(options)` | `src/components/DeptchChart/hooks/useDepthChartHover.ts` | 负责中轴对称 hover、双 tooltip、mask、高亮点、坐标换算。 | Implements centered symmetric hover, dual tooltips, masks, highlighted points, and pixel/axis conversions. |
| `useEchartsModule()` | `src/components/DeptchChart/hooks/useEchartsModule.ts` | 懒加载并缓存 ECharts core/components。 | Lazy-loads and caches ECharts core and required components. |

## 8. Editing Rules By Layer / 按层修改的 AI 规则

### 8.1 Pages and Layouts / 页面与布局

- CN: `src/pages/*` 只做路由入口、`useHead`、`definePageMeta`、视图拼装；不要把复杂业务细节塞进 page。
- EN: Keep `src/pages/*` focused on route entry, `useHead`, `definePageMeta`, and high-level view composition; do not bury complex business logic there.
- CN: 若一个功能只在 `/spot` 页面使用，优先放在 `src/views/spot/components/*`，不要先入为主提到 `src/components/*`。
- EN: If a feature only serves `/spot`, place it under `src/views/spot/components/*` before considering `src/components/*`.

### 8.2 Components / 组件层

- CN: `src/components/*` 中的组件应保持“跨页面可复用”；其 props/emits 要比业务页面更通用。
- EN: Components under `src/components/*` should stay reusable across pages; their props/emits should be more generic than feature-specific views.
- CN: `src/components/OrderBook.vue` 已经是通用订单簿，不要再在其他页面复制另一份相似实现。
- EN: `src/components/OrderBook.vue` is already the generic order-book implementation; do not copy a parallel version into other pages.
- CN: 交易页里的 `src/views/spot/components/OrderBook.vue` 是“专页定制版”，只在确认别处也需要同样视觉和交互时，才考虑抽象合并。
- EN: The trading-page `src/views/spot/components/OrderBook.vue` is intentionally page-specific; only abstract it if another feature truly needs the same UX.

### 8.3 Composables and Side Effects / 组合式逻辑与副作用

- CN: WebSocket 生命周期、缓冲、快照同步、重连、浏览器事件都应留在 composables，不要回流到模板组件。
- EN: WebSocket lifecycle, buffering, snapshot sync, reconnect behavior, and browser event handling belong in composables, not back inside template-heavy components.
- CN: 新增流式行情能力时，优先按 `useBinanceTradeStream/useBinanceDepthStream/useBinanceKlineStream` 的接口风格扩展。
- EN: When adding new streaming market features, follow the interface style established by `useBinanceTradeStream`, `useBinanceDepthStream`, and `useBinanceKlineStream`.

### 8.4 API and Data Access / 接口与数据访问

- CN: 真实后端接口应先在 `src/api/*` 暴露语义化函数，再由页面/视图调用。
- EN: Real backend endpoints should first be exposed as semantic functions in `src/api/*`, then consumed by views/pages.
- CN: 优先使用 `src/http/useHttp.ts`，因为它已经统一注入 token、语言和错误处理。
- EN: Prefer `src/http/useHttp.ts` because it already injects token, locale, and shared error handling.
- CN: 除非你在维护旧代码，不要继续扩展 `src/http/index.ts` 这条遗留分支。
- EN: Do not keep expanding `src/http/index.ts` unless you are intentionally maintaining the legacy path.

### 8.5 i18n / 国际化

- CN: 当前语言包文件是 `src/lang/zh-CN.json`、`src/lang/en-US.json`、`src/lang/ar-AE.json`、`src/lang/ru-RU.json`。
- EN: The current locale files are `src/lang/zh-CN.json`, `src/lang/en-US.json`, `src/lang/ar-AE.json`, and `src/lang/ru-RU.json`.
- CN: 当前 key 风格是扁平中文字符串，例如 `t('价格')`、`t('登录成功')`；新代码必须延续这一约定，除非项目统一迁移。
- EN: The current key style uses flat Chinese strings such as `t('价格')` and `t('登录成功')`; new code must follow that convention unless the entire project is migrated.
- CN: 看到现有硬编码中文并不代表它是正确做法；它只是存量技术债。新代码不允许继续复制这种模式。
- EN: Existing hardcoded Chinese strings are not a pattern to copy; they are technical debt. New code should not repeat that behavior.
- CN: 语言切换还会影响 `dir`，所以修改 Header/locale 流程时要保留 RTL 支持。
- EN: Locale switching also affects document `dir`, so preserve RTL support when editing header/locale flows.

### 8.6 Styling / 样式层

- CN: 主题色优先通过 CSS 变量和 `src/utils/themeTokens.ts` 兜底，不要在图表代码里散落硬编码背景色。
- EN: Prefer CSS variables plus `src/utils/themeTokens.ts` fallbacks for theme colors instead of scattering hardcoded background values in chart code.
- CN: 首页和交易页大量使用 Tailwind utility classes；新增样式优先延续现有 Tailwind + 全局 token 组合，不要随意引入另一套样式体系。
- EN: Home and trading pages already rely heavily on Tailwind utility classes; continue the Tailwind + global token approach instead of introducing a new styling system.

### 8.7 Charts and Market Data / 图表与行情数据

- CN: `StreamingChart.vue` 负责 TradingView 外壳，`LineChart.vue` 负责延迟趋势，`DeptchChart/index.vue` 负责深度图；修改职责不要串层。
- EN: `StreamingChart.vue` owns the TradingView wrapper, `LineChart.vue` owns the latency chart, and `DeptchChart/index.vue` owns the depth chart; do not blur these responsibilities.
- CN: 深度图核心行为包括“围绕 mid 对称缩放”“固定 5 个 x 轴刻度”“自适应聚合”“双 tooltip hover”；改其中任何一项都要检查是否破坏整体体验。
- EN: The depth chart relies on symmetric mid-centered zoom, fixed 5-tick x-axis behavior, adaptive aggregation, and dual-tooltip hover; changing one of these requires checking the whole interaction model.
- CN: Hover 查询必须基于当前渲染后的 series，而不是原始盘口数据，否则 tooltip 会和图形错位。
- EN: Hover lookup must use the currently rendered series rather than raw book data, otherwise tooltips will drift away from the rendered curve.

### 8.8 Types and Contracts / 类型与契约

- CN: 新的跨文件业务类型放在 `types/*`，局部类型留在组件或 composable 内部。
- EN: Put new cross-file business types under `types/*`, and keep purely local types inside the component or composable that owns them.
- CN: 即便 ESLint 放宽了 `any`，也不要把它当常规写法；新增接口和 composables 应优先给出明确类型。
- EN: Even though ESLint is lenient about `any`, do not normalize it; new APIs and composables should still prefer explicit typing.

### 8.9 Comments and Readability / 注释与可读性

- CN: 新增或改动“逻辑代码”时必须补充详细注释，至少说明输入、核心流程、边界条件与副作用；尤其是异步流程、状态切换、图表计算、WebSocket 生命周期这类高复杂度代码。
- EN: When adding or modifying logic code, include detailed comments covering inputs, core flow, edge cases, and side effects, especially for async flows, state transitions, chart calculations, and WebSocket lifecycle handling.
- CN: 新增或改动 DOM 结构与样式时，允许使用“区块级/分区级”注释描述布局意图、交互分层与主题差异；不要求逐行样式注释，但必须让后续维护者能快速理解结构。
- EN: For DOM structure and styling changes, use section-level comments to explain layout intent, interaction layering, and theme differences; line-by-line style comments are not required, but structure must remain easy to understand for future maintainers.

## 9. Known Caveats / 已知历史包袱与注意事项

- CN: `src/components/DeptchChart/` 的拼写是历史遗留。外部入口是 `src/components/DepthChart.vue`；若要重命名，需要一次性修完所有 import、文档和兼容层。
- EN: `src/components/DeptchChart/` is a historical misspelling. The public entry is `src/components/DepthChart.vue`; renaming it requires a coordinated import/documentation/compatibility migration.
- CN: dayjs 行为统一在 `nuxt.config.ts` 的 `dayjs-nuxt` 模块中维护；不要在 `src/utils/*` 下再放 `defineNuxtConfig` 片段。
- EN: Dayjs behavior is maintained centrally via the `dayjs-nuxt` module in `nuxt.config.ts`; do not add `defineNuxtConfig` fragments under `src/utils/*`.
- CN: `src/store/index.ts` 目前只创建 Pinia 实例，没有成熟 domain store；不要因为“项目有 store 目录”就把局部状态搬进去。
- EN: `src/store/index.ts` only creates the Pinia instance and does not yet define mature domain stores; do not move local state there just because the directory exists.
- CN: `src/server/` 目前没有实际 Nitro API 文件；不要假设仓库已经有完整 server route 结构。
- EN: `src/server/` currently has no real Nitro API handlers; do not assume the repo already has a complete server-route structure.
- CN: 某些 spot 子组件仍有硬编码文案，例如按钮标题或表头英文，这些是待清理项，不是新代码规范。
- EN: Some spot subcomponents still contain hardcoded copy or mixed-language headers; treat these as cleanup targets, not as style guidance for new code.
- CN: README 中个别路径和说明已经落后，例如旧结构描述、旧组件命名；修改时请以实际代码树为准。
- EN: Some README paths and descriptions are outdated, including older structure notes and legacy naming; trust the actual source tree when editing.

## 10. Preferred Change Patterns / 推荐改法

- CN: 新增行情模块时，优先模式是 “`types` 定义契约 -> `composables` 管流/副作用 -> `views` 做业务编排 -> `components` 做展示”。
- EN: For new market-data features, prefer the pattern “`types` define contracts -> `composables` manage streams/side effects -> `views` orchestrate feature state -> `components` render UI”.
- CN: 需要新建全局可复用图表时，优先抽到 `src/components/*`，并把绘图细节继续拆进 `hooks/*`。
- EN: When creating a new globally reusable chart, place the UI shell in `src/components/*` and keep rendering logic split into dedicated `hooks/*`.
- CN: 同一逻辑如果已经在 `src/utils/common.ts` 或图表 hooks 里存在，不要在页面组件里重新实现一遍。
- EN: If equivalent logic already exists in `src/utils/common.ts` or chart hooks, do not reimplement it inside a page component.
