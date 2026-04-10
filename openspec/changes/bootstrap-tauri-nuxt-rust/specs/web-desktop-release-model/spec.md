## ADDED Requirements

### Requirement: Web 部署与 Desktop 发布分离
系统必须将 Web 与 Desktop 的构建发布链路分离，并保证版本兼容策略可追踪。

#### Scenario: Web 构建与部署
- **WHEN** 触发 Web 发布
- **THEN** 使用 Nuxt 构建产物进行服务器或 CDN 部署，不依赖 Tauri 打包流程

#### Scenario: Desktop 打包
- **WHEN** 触发 Desktop 发布
- **THEN** 使用 Tauri 构建平台安装包与更新元数据，不依赖 Web 服务器部署

#### Scenario: 更新通道
- **WHEN** 发布新桌面版本
- **THEN** 必须支持至少 `stable` 与 `beta` 两条更新通道

#### Scenario: 版本兼容
- **WHEN** Desktop 版本升级或降级
- **THEN** 必须校验运行时协议版本，避免新旧端消息协议不兼容导致崩溃
