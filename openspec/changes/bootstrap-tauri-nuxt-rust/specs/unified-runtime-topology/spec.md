## ADDED Requirements

### Requirement: 统一多端运行时拓扑
系统必须支持同一套前端业务界面运行在 Web 与 Desktop 两种宿主环境中，并保持核心业务行为一致。

#### Scenario: Web 运行模式
- **WHEN** 应用运行在浏览器环境
- **THEN** 使用 Nuxt 前端直接连接 REST/WS，完成行情与交易交互

#### Scenario: Desktop 运行模式
- **WHEN** 应用运行在 Tauri Desktop 环境
- **THEN** 前端 UI 保持一致，基础设施能力由 Rust Runtime 承担

#### Scenario: 业务逻辑一致性
- **WHEN** 用户在 Web 与 Desktop 执行同一业务操作（登录、订阅、下单、撤单）
- **THEN** 前端状态机与交互反馈语义一致，仅底层连接实现可不同
