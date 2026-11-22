---
name: agent-team
description: Run a multi-agent team across harnesses through Agent HUD's messaging tools (list_sessions, start_session, send_message, get_message). Use it when the person wants to split a task across several AI clients and have one agent coordinate — assign roles, dispatch work, track replies and hand results back. One agent leads (talks to the person, splits and dispatches) while teammates in other harnesses (Claude Code, Codex, Antigravity, DeepSeek…) take the UI, backend, ops or drafting pieces. Each teammate is opened in the SAME project folder so it inherits the project's AGENTS.md / CLAUDE.md, files and memory; temporary work goes in .tmp/. Use it for "派活给别的 agent", "多 agent 协同", "组个团队做这个", "让 Antigravity 做 Uer, Codex 做后端", "team this up", "/team", "coordinate the agents", and to set up a reusable team workflow in a project.
metadata:
  managed-by: agent-hud
---

# Agent Team — 跨 harness 多 agent 协作

Agent HUD 把它的消息工具加到了这个客户端，MCP server 名为 `agent-hud`。本技能用工具自己的名字；你的客户端可能在前面带上 server 名，例如 Claude Code 把 `send_message` 显示为 `mcp__agent-hud__send_message`。

你是**协调者**：和人沟通、拆任务、派发、读回、验收、汇报。队友是**别的 harness 里、同一个项目文件夹下**的会话。本技能只用现有消息工具编排，不需要任何新功能。

## 工具（协作四件套）

- `list_sessions({})` — 发现当前会话。返回每个会话的 `client`、`id`、`project`、`cwd`、`state`、`reachable`、`self`。**先用它**找同目录、同角色的已有会话来复用。人在 Agent HUD 设置里存过团队时，它还会返回 `teams`（见下）。
- `start_session({ client, text, folder })` — 在某个 harness 新开一个会话并发首条任务。**务必传 `folder`**（见下）。返回一个可追踪的 message id。
- `send_message({ text, to, reply_to? })` — 给已有会话（`to` = 它的 session id）派活或追问。返回 message id 与排队状态。
- `get_message({ id })` — 按 message id 读回：送达/执行/完成状态与对方回复。派活后用它收结果，别空等。

消息状态：`queued` 排队、`taken` 已领、`started` 执行中、`done` 完成、`replied` 已回信，以及 `refused`、`expired`、`uncertain`。

## 角色花名册

### 人存过的团队优先

`list_sessions` 返回里有 `teams` 时，那是人在 **Agent HUD → Settings → Agents** 里亲手存的花名册，**按它来，别用下面的默认表**。每个团队给出：

- `name` — 团队名；`folder` — 这个团队服务的项目目录（没有这个键就是不限项目）。
- `limit` — 每个成员同时最多接几项任务，按它控制在手任务数。
- `members` — 每人一条：`client`（哪个客户端）、`role`（担任什么角色），以及 `session`（人指定了具体会话时才有，直接发给它）。

成员没给 `session` 时，照下面「同目录派活」的办法，在 `folder` 里找该 `client` 的会话来复用，找不到就在 `folder` 里开一个。`folder` 和当前项目目录不一致时，以 `folder` 为准，并跟人说一声。

### 默认建议绑定（没有存过团队时才用）

角色是职责，不是固定的某个客户端；下面是**默认建议绑定**，人可以随时改绑。

| 角色 | 职责 | 交付物 | 默认 harness |
|---|---|---|---|
| **协调者 / Lead** | 和人沟通，定方案与验收标准，拆任务、派发、追踪、汇总 | 任务清单、进度、待决策项 | Claude Code |
| **UI / 视觉** | 前端视觉、布局、交互、素材；只打磨不重设计时明确说明 | 设计稿、组件、页面 | Antigravity (Gemini) |
| **后端 / 运维 / 排查** | 后端实现、部署、脚本、线上排查 | 代码、部署、排查结论 | Codex |
| **架构 / 草稿** | 低成本的架构设计、网关设计、初稿 | 方案、草图、草稿 | DeepSeek |

一个客户端可同时担多个角色；同一角色也可换绑别的客户端。

## 两条硬规则

### 1. 同目录派活，继承环境记忆（不要开裸新会话）

队友必须在**和当前项目同一个文件夹**里开会话，这样它才继承该项目的 `AGENTS.md` / `CLAUDE.md`、文件和记忆；直接开一个无目录的新会话会丢掉全部上下文。

1. 先 `list_sessions({})`，找 `cwd`（或 `project`）等于当前项目目录、`client` 等于目标角色的会话。
2. 找到 → 用 `send_message({ to: <那个会话的 id>, text })` 复用它。
3. 没找到 → `start_session({ client, folder: "<当前项目的绝对路径>", text })`，`folder` 一定要填当前项目目录。

### 2. 临时文件进 `.tmp/`，别在项目里拉屎

每个成员（包括你）产生的中间文件、测试文件、草稿，统一放在项目根的 `.tmp/`；任务完成后清理本次产生的临时文件。**不删**任务开始前已有的文件，也**不碰**交付物。派发时把这条写进简报，让队友照做。

## 派发简报模板

每次派活都带齐四项，贴进 `send_message`/`start_session` 的 `text`：

```text
【角色】你负责本项目的 <角色>。项目目录：<绝对路径>（你已在同目录，可直接读 AGENTS.md/CLAUDE.md 和项目文件）。
【目标】<一句话要什么>
【背景】<必要上下文、已定方案、约束>
【范围】只改 <这些文件/这块>，别动 <那些>。临时文件放 .tmp/，完成后清理。
【交付】<要什么产物 + 验收标准>；完成后回一条消息说清改了什么、怎么验证。
```

## 协调闭环

1. **拆**：把需求拆成角色明确、依赖清晰的任务；每个成员同时在手的任务不超过团队的 `limit`（没有存过团队时按 1 项）。
2. **派**：按上面的模板派发；有依赖的后置任务等前置交付后再派（方案定了再派 UI/后端，素材齐了再整合）。
3. **读回**：用 `get_message` 收结果，别空等、别猜；`refused`/`expired` 就重试或换人。
4. **验收**：看实际产物（文件/diff/运行结果），通过才算完成。
5. **汇报**：只向人汇报进度、阻塞和待决策项；细节替人消化掉。

## 共用约束（让各 harness 读到同一套规则）

不同 harness 读不同的约束文件。组队时在项目里建/校对一份**单一事实来源**，让它们都指向它：

- 规范内容写进 **`AGENTS.md`**（Codex 等原生读，事实标准）：角色归属、文件范围、交付标准，以及「临时文件进 `.tmp/`、完成后清理」。
- **Claude Code**：较新的版本（v2.1.277 起，默认模式 `claude-md-or-agents-md`）在项目没有 `CLAUDE.md` 时会**直接读 `AGENTS.md`**；可在 `/config → Project instructions` 调整。为兼容旧版、或项目里已另有 `CLAUDE.md` 的情况，稳妥做法是放一个只含一行导入的 `CLAUDE.md`：

  ```text
  @AGENTS.md
  ```

  （Claude 支持 `@path` 导入，这样无论版本、无论是否已有 `CLAUDE.md`，Claude 和 Codex 都读同一份。）
- **Antigravity** 等有自己 rules 文件的，放一行指向同一份 `AGENTS.md`。

这样 4 个 harness 在同一项目下读到同一套角色、范围与 `.tmp/` 纪律。

## 当工具缺失或被拒

- **没有 `list_sessions` / `send_message` 工具**：这个客户端还没加 HUD 工具。请人打开 Agent HUD → **Settings → Agent plugins**，给这个客户端加 **HUD tools**，再开一个新会话（工具在会话启动时加载）。
- **消息被 `refused`**：对方会话可能没加载插件（让它 `/reload-plugins` 或重开），或对方关了接收开关。用 `list_sessions` 看 `reachable` 和原因。
- **`uncertain`**：稍等重试一次 `get_message`。

本技能不替人做决定：派发、组队、改约束前，先把计划和影响告诉人，得到同意再做。
