## Why

当前仓库已有可复用的 Nuxt 交易控制台模板，但尚未形成「Web + Desktop（Tauri）+ Rust 能力下沉」的一体化架构规范。  
若不先固定架构边界，后续会出现：
- Web 与 Desktop 业务逻辑分叉
- WebSocket 与重连策略不一致
- 密钥与鉴权实现不统一
- 发布链路（Web 部署 vs Desktop 打包）混淆

## What Changes

本变更在 OpenSpec 中定义 V0 架构基线，覆盖以下能力：

1. 统一运行时架构
- Web：Nuxt 前端直连后端 REST/WS
- Desktop：Nuxt UI + Rust WS Gateway（Rust 持有连接，前端订阅事件）

2. WebSocket 可靠性策略
- 心跳、指数退避重连、订阅恢复、去重与序列保护
- 区分行情流与私有交易流（鉴权、重放窗口不同）

3. 凭据与审计基线
- Web 端仅保存短期会话凭据
- Desktop 端通过系统钥匙串保存敏感密钥
- 关键交易动作记录最小审计日志

4. 部署与发布模型
- Nuxt Web 与 Tauri Desktop 分离构建
- Desktop 支持稳定版/测试版更新通道

## Capabilities

### New Capabilities
- `unified-runtime-topology`
- `desktop-rust-ws-gateway`
- `credential-and-audit-baseline`
- `web-desktop-release-model`

### Modified Capabilities
- 无（项目初始架构定义）

## Impact

**目录与工程影响（后续实现阶段）**
- 新增 `src-tauri/`（Rust Runtime、命令桥接、更新配置）
- 新增 `src/services/ws/`（Web 端 WS 客户端 + Desktop 事件适配）
- 新增 `src/stores/trading/`（行情态与交易态统一 Store 协议）
- 新增 `openspec/` 规范资产（本次已创建）

**CI/CD 影响（后续实现阶段）**
- Web pipeline：`yarn build` + Web 部署
- Desktop pipeline：`tauri build` + updater artifact 发布

**安全与合规影响**
- 增加密钥安全存储与审计链路，需同步后端验签与审计策略
