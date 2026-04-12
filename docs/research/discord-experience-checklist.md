# Discord 当前体验清单

> 基于 Kagura Discord server 实际运行（2026-04-12 梳理）

## 1. 总控室（#kagura-dm）

- Luna 与 Kagura 的主沟通渠道
- heartbeat 每 30 分钟轮询，读 HEARTBEAT.md 执行或 HEARTBEAT_OK
- Pin 固定：TODO.md + 北极星（wiki/strategy.md）+ Config
- 所有重要决策在此发起

## 2. Channel 自治

每个 channel 有独立定位文件（`channels/<name>.md`），包含：
- **定位**：channel 做什么
- **准则**：cron 触发时的行为规则
- **北极星**：channel 级目标

当前 channel 分类：
| 类型 | Channels | 特征 |
|---|---|---|
| Daily | work, study, community, general | 日常循环，cron 驱动 |
| Project | abti, uncaged, hermes, memex, caduceus, agent-collab | 项目专属，按需触发 |
| Meta | kagura-dm, luna-private | 人机沟通 |

## 3. 北极星 / TODO 驱动

- **单一 TODO 文件**（`TODO.md`）：所有 channel 的 cron 从同一份 TODO 消化任务
- **北极星**（`wiki/strategy.md`）：长期方向，pin 在总控室
- TODO 规则：新任务即加、做完即删、拖 3 天必须做或删
- 每个 channel 对应 TODO 中的 section（如 🔨 打工 → #work，📚 学习 → #study）

## 4. Channel 文件 → Pin 自动同步

- Hook：`hooks/todo-pin-sync/`
- TODO.md 变更 → 自动更新 #kagura-dm pin
- wiki/strategy.md 变更 → 自动更新北极星 pin
- **局限**：目前只同步 2 个文件到 1 个 channel，未扩展到所有 channel

## 5. Cron 驱动各 Channel

| Channel | Cron | 频率 | 行为 |
|---|---|---|---|
| #kagura-dm | heartbeat | 每 30m | 读 HEARTBEAT.md，杂务处理 |
| #work | work-loop | 每小时 :02（8-20） | 读 TODO 🔨 → 取任务 → 执行 |
| #study | study-loop | 每小时 :15,:45（8-22） | 读 TODO 📚 → 学习任务 |
| #community | community-ops | 每 2h :40 | 社区维护 |
| #uncaged | uncaged-check | 每天 11:00 | 跟进 PR、找 issue |
| #hermes | caduceus-observe | 3x/天 10,16,22 | 观察 Caduceus 实验 |
| #memex | memex-dogfood | 每天 22:00 | dogfood 使用 |
| #workshop | workshop-loop | 每 2h（8-22） | Workshop 开发 |

**模式**：cron 触发 → 读 channel 文件（准则）→ 读 TODO 对应 section → 执行 → 更新 TODO

## 6. Channel-Patrol 巡检

- **当前状态**：尚未正式实现
- **设想**：定期巡检所有 channel，汇总进度到总控室
- **替代方案**：目前 Luna 通过 #kagura-dm heartbeat 间接获得全局视图

## 7. 跨 Channel 通信

- **当前方式**：通过文件系统（TODO.md、memory/）间接通信
- **无直接 channel→channel 消息传递**
- cron 之间通过共享 TODO 协调（如 work-loop 完成任务，study-loop 能看到更新）

## 8. 可见性与介入

- **可见性**：所有 agent 行为发生在 Discord channel 中，Luna 可实时看到
- **介入**：Luna 在任何 channel 发消息，agent 下次 cron 触发时能看到
- **局限**：非实时介入——需等 cron 触发或 heartbeat

## 待 Workshop 解决的 Gap

1. **跨 channel 通知**：任务完成后无法主动通知其他 channel
2. **Channel-patrol**：无自动化巡检汇总
3. **Pin 同步范围窄**：只有 2 个文件同步到 1 个 channel
4. **实时介入**：依赖 cron 周期，非即时响应
5. **Agent 间协作**：目前只有 Kagura 一个 agent，多 agent 场景未验证
6. **任务生命周期**：TODO 只有"存在"和"删除"两态，无 in-progress/review 状态
