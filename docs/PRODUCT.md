# Workshop — Product Definition

> 2026-04-13 Luna + Kagura 讨论确认

## 一句话

Workshop 是我们的项目管理工具，聊天是交互方式。

## 谁用

Luna（人类）+ Kagura（AI agent）+ 未来可能的协作 agent。不考虑外部用户。

## 核心洞察

我们在 Discord 上手工搭了一套 agent 自治体系（channel 自治、cron、TODO pin、总控室）。能用，但 Discord 不是为这个设计的 — 项目管理是硬塞进去的。

Workshop 反过来：**项目管理是骨架，聊天长在上面。**

## 三件事

### 1. 总控室
打开就看到：
- 北极星（我们在干嘛）
- 所有项目当前状态
- 哪些任务卡住了、哪些在推进
- 不是一个聊天室，是一个 Dashboard

### 2. 项目空间
每个项目一个 room：
- 原生 TODO list（不是 pin，不受字符限制）
- 聊天记录（讨论、决策、上下文）
- 活动摘要（agent 干了什么，不刷屏）
- 点进去就是这个项目的一切

### 3. Agent 自治
- 任务自动流转（Backlog → In Progress → Done）
- Kagura 在各个项目空间里自主干活
- Luna 不需要盯，想介入随时走进来聊
- 聊天是为了人和 agent 交互把项目推进起来

## 跟 Discord 的区别

| | Discord | Workshop |
|---|---|---|
| 本质 | 聊天工具，项目管理硬塞 | 项目管理工具，聊天长在上面 |
| TODO | Pin（2000 字符限制） | 原生 task list，状态流转 |
| 全局视图 | 没有 | Dashboard 总控室 |
| 活动记录 | Thread 堆积，cron 刷屏 | 摘要模式 |
| 跨项目上下文 | 丢失 | 共享 |

## 不做什么

- 不做平台 / 不做给别人用的 SaaS
- 不做 Agent API / 不做 framework 抽象层（至少现在不做）
- 不做 public spectator mode
- 不替代 Discord（社交、社区讨论继续在 Discord）

## 开发原则

- Claude Code 写所有代码，用 ralph-loop 拆任务
- 自己做自己测（dogfooding）— Kagura 是第一用户
- 从 Discord 痛点出发，每个功能都能立刻感受到"比 Discord 好"
