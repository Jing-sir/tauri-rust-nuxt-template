## Context

仓库基线是 Nuxt 4 交易控制台模板，具备 UI、i18n、Pinia、HTTP 封装与基础行情组件。  
目标是在不分叉前端业务代码的前提下，引入 Tauri + Rust 桌面能力，支持交易所场景下的稳定连接与安全存储。

## Goals / Non-Goals

**Goals**
- 统一 Web 与 Desktop 的业务交互模型（页面与 Store 尽量共用）
- 将 Desktop 端高可靠连接能力下沉到 Rust
- 明确 Web 与 Desktop 发布边界，避免构建链路耦合
- 定义 V0 安全与审计最小闭环

**Non-Goals**
- 本变更不直接实现撮合引擎、风控引擎、清结算系统
- 不在 V0 完成多交易所聚合路由与策略交易
- 不定义后端内部微服务拆分细节

## Decisions

### 1. 双运行时连接策略

- Web Runtime：Nuxt 前端直接连接业务 WS（公共行情 + 私有交易流）
- Desktop Runtime：Rust 持有 WS 连接与重连状态机，前端通过 Tauri 事件订阅增量数据

这样可在桌面端获得更好的连接稳定性与本地能力，同时保持 Web 架构简单。

### 2. 前端与 Rust 的事件桥协议

定义统一事件信道（示例）：
- `market.depth.delta`
- `market.trade.tick`
- `order.update`
- `position.update`
- `account.balance.update`
- `runtime.connection.state`

前端只消费业务事件，不直接依赖 Rust 内部连接细节。

### 3. 可靠性策略

- 心跳超时：触发连接状态降级
- 重连策略：指数退避 + 抖动（避免雪崩重连）
- 订阅恢复：重连后自动恢复上次订阅集
- 去重与有序性：按 `channel + sequence` 做幂等保护

### 4. 凭据安全分层

- Web：仅保存短时 token，不保存 API Secret
- Desktop：敏感凭据进入系统钥匙串（或同等级安全存储）
- 前端不直接读取明文 Secret；签名逻辑在 Rust 内执行

### 5. 构建与发布分离

- Web：`nuxt build` / `nuxt generate` 产物用于服务器/CDN 部署
- Desktop：`tauri build` 产物为安装包和 updater 元数据
- 二者版本策略共享语义版本，但交付链路分离

## Runtime Data Flow

1. 用户登录  
前端获取会话 token；Desktop 端额外完成本地凭据解锁（若需要私有交易接口签名）。

2. 行情订阅  
Web 端直接发起 WS 订阅；Desktop 端由前端发订阅意图给 Rust，Rust 建立/维护订阅并回推事件。

3. 下单/撤单  
前端提交订单意图；Web 端直接 REST/WS 下单，Desktop 端由 Rust 负责签名与请求发起，再将结果事件回传前端。

4. 断线恢复  
连接断开后进入重连状态机，恢复后重建订阅并推送 `runtime.connection.state=ready`。

## Risks / Trade-offs

- Rust 网关增加实现复杂度，但换来更强的桌面稳定性与安全边界
- Web 与 Desktop 双策略会增加测试矩阵，需要统一契约测试
- 自动更新引入版本兼容风险，需要明确最低兼容协议版本
