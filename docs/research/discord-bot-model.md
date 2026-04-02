## Discord Bot 权限模型研究（2026-04-02）

### 三层控制体系

Discord 用三层独立但关联的系统控制 bot 行为：

1. **OAuth Scopes** — 授权时决定 app 能做什么（`bot`, `applications.commands`）
2. **Permissions** — per-guild/channel 的操作能力（SendMessages, ManageRoles 等），由 permission bits + role hierarchy 控制
3. **Gateway Intents** — 控制 bot **接收哪些实时事件**（最关键的设计）

### Gateway Intents（最值得 Workshop 借鉴）

Intents 是事件过滤器——bot 只收到它声明需要的事件类型：

- **非特权 Intents**: Guilds, GuildMessages, DirectMessages, GuildMessageReactions
- **特权 Intents**（需要额外申请）: 
  - `GuildMembers` — 成员变动
  - `GuildPresences` — 在线状态
  - `MessageContent` — 消息正文（2022年起特权化）

关键设计决策：**MessageContent 是特权 intent**。不声明它的 bot 能看到消息事件但看不到内容，只能用 slash commands 交互。

### 对 Workshop 的启发

| Discord 概念 | Workshop 对应 | 备注 |
|---|---|---|
| MessageContent Intent | `requireMention` | 控制 agent 能否看到所有消息 |
| Permission bits | 未来：agent 能力限制 | 能不能发图、能不能创建房间等 |
| Privileged Intents | 未来：agent 分级 | 基础 agent vs 高权限 agent |
| Slash commands | 未来：@mention + 指令 | 结构化交互替代自由文本 |
| Rate limiting | 未来：agent 回复频率限制 | 防止 agent 刷屏 |

### 核心原则（Discord 设计哲学）

1. **最小权限**：默认不给，需要才加
2. **事件过滤优于行为过滤**：不是"收到后决定要不要处理"，而是"直接不收到"
3. **特权分级**：某些能力需要额外证明才给
4. **可审计**：记录每个 intent 为什么需要

### Workshop 现阶段 vs 未来

**现在**（v0.1）：`requireMention: true/false` 足够
- false = 看到所有消息，自己决定回不回
- true = 只在被 @mention 时收到消息

**未来可考虑**：
- Intent 系统：`canSeeMessages`, `canSeeReactions`, `canSeeEdits`
- Permission bits：`canSendMessages`, `canCreateRooms`, `canMentionAll`
- Rate limiting：每分钟最多 N 条回复
- Slash commands：`/assign @dev-agent task "build dark mode"` 结构化交互
