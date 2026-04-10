## ADDED Requirements

### Requirement: Desktop 端 Rust 托管 WebSocket
Desktop 端必须支持由 Rust Runtime 托管 WebSocket 连接，并向前端提供标准化事件流。

#### Scenario: 连接建立与状态通知
- **WHEN** 用户进入需要实时数据的页面
- **THEN** Rust Runtime 建立对应 WS 连接，并向前端发送 `runtime.connection.state` 状态事件

#### Scenario: 自动重连
- **WHEN** WS 连接异常断开
- **THEN** Rust Runtime 触发指数退避重连并在恢复后回放订阅意图

#### Scenario: 事件统一格式
- **WHEN** Rust Runtime 收到行情或交易更新
- **THEN** 必须按统一事件格式转发（至少包含 `type`、`channel`、`timestamp`、`payload`）

#### Scenario: 幂等保护
- **WHEN** 收到重复或乱序增量数据
- **THEN** Runtime 必须按序列号策略做去重/丢弃，避免前端状态污染
