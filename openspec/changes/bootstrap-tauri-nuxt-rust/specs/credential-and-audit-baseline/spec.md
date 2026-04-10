## ADDED Requirements

### Requirement: 凭据安全与最小审计基线
系统必须为 Web 与 Desktop 提供分层凭据策略，并记录关键交易动作的最小审计日志。

#### Scenario: Web 凭据约束
- **WHEN** 用户在 Web 登录并进行交易
- **THEN** 前端仅保存短期会话凭据，不得持久化 API Secret 明文

#### Scenario: Desktop 凭据存储
- **WHEN** 用户在 Desktop 配置 API Key/Secret
- **THEN** 敏感凭据必须进入系统钥匙串或同等级安全存储，禁止明文落盘

#### Scenario: Rust 内签名
- **WHEN** 需要私有接口签名（如下单、撤单）
- **THEN** 签名过程应在 Rust Runtime 完成，前端不接触 Secret 明文

#### Scenario: 最小审计记录
- **WHEN** 发生登录、下单、撤单、资金相关动作
- **THEN** 系统应记录最小审计信息（动作类型、时间、结果、关联请求标识）
