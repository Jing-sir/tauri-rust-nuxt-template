## 1. 项目基线与规范

- [x] 1.1 将现有 Nuxt 模板迁移到 `tauri-rust-nuxt-template` 仓库根目录（排除 `.git/.nuxt/node_modules`）  
  验证：项目目录存在 `nuxt.config.ts`、`src/`、`package.json`
- [x] 1.2 初始化 OpenSpec 目录与配置文件  
  验证：`openspec/config.yaml` 存在，且 `schema: spec-driven`

## 2. Tauri 桌面壳初始化（实现阶段）

- [x] 2.1 初始化 `src-tauri/` 并完成与 Nuxt 前端的最小启动联通  
  验证：`tauri dev` 可启动并加载 Nuxt 界面
- [x] 2.2 建立前端到 Rust 的命令桥（invoke）和事件桥（event）基础层  
  验证：前端可调用 Rust 命令并收到 Rust 主动推送事件
  > 已新增 Rust 命令 `ping_rust` / `emit_runtime_state` 与前端 `useRuntimeBridge`。编译与启动链路已验证，业务页面接入联调放在后续任务。

## 3. WebSocket 运行时分层（实现阶段）

- [ ] 3.1 实现 Web Runtime WS 客户端（直连模式）  
  验证：Web 环境下可完成行情订阅、断线重连与恢复
  > 已落 `WebRuntimeGateway` 基础实现（订阅、心跳、指数退避重连、消息归一化），并接入 `useBinanceTradeStream` 与 `useBinanceDepthStream` 分支逻辑，待更多行情流迁移后勾选。
- [x] 3.2 实现 Desktop Runtime Rust WS Gateway（托管模式）  
  验证：Desktop 环境下由 Rust 维护连接，前端可收到标准化事件流
  > 已补齐 Rust 侧 `runtime_subscribe/runtime_unsubscribe/runtime_disconnect_all`，并在 `useBinanceTradeStream` 接入 Desktop runtime 网关；`tauri:dev` 冒烟通过。
- [ ] 3.3 定义并固化统一事件模型（行情/订单/账户/连接状态）  
  验证：Web 与 Desktop 均可驱动同一套前端 Store 更新逻辑
  > 已在 `src/services/runtime/types.ts` 定义统一事件与连接状态契约，并新增 `src/store/runtimeEvent.ts` 统一分发，待接入更多业务 Store 完成闭环。

## 4. 安全与审计基线（实现阶段）

- [ ] 4.1 接入 Desktop 凭据安全存储（系统钥匙串或同等方案）  
  验证：凭据不以明文形式写入本地文件
  > 已新增 Rust 命令 `save_secure_credential/load_secure_credential/delete_secure_credential`（keyring），并提供前端 `useSecureCredential` 封装；待业务界面接线与异常流验证后勾选。
- [ ] 4.2 实现交易关键动作的最小审计记录  
  验证：登录、下单、撤单、资金操作可追踪

## 5. 部署与发布（实现阶段）

- [ ] 5.1 建立 Web 构建与部署链路（SSR 或静态站点）  
  验证：Web 产物可在目标服务器环境运行
- [ ] 5.2 建立 Desktop 打包与自动更新链路（stable/beta）  
  验证：可产出安装包并完成一次升级测试

## 6. 联调与验收（实现阶段）

- [ ] 6.1 交易主链路联调：登录 -> 订阅行情 -> 下单 -> 撤单 -> 断线恢复  
  验证：Web 与 Desktop 行为一致，错误态可回收
- [ ] 6.2 质量门禁：`yarn lint` + `yarn typecheck` + 桌面端冒烟  
  验证：无阻断错误后方可进入下一里程碑
