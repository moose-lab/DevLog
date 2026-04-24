# 任务-Agent 编排设计 Spec

**日期**：2026-04-23
**作者**：Moose（产品 brainstorm）+ Claude（调研与设计）
**状态**：待审阅
**关联代码**：`src/core/process-manager.ts`、`src/core/worktree-manager.ts`、`src/core/stream-manager.ts`、`src/core/db-schema.ts`、`src/components/kanban/*`

---

## 1. 背景与目标

DevLog 已经具备 worktree 隔离、`claude -p` stream-json 持久进程（ProcessManager）、SSE 推送、Kanban 拖拽、任务详情 Dialog、PR 自动化、retry-with-feedback。现状缺口是**显式的任务调度与异常处理语义**，以及**面向 ADHD 用户的中间态视图**。

本 spec 目标是：让"项目任务 ↔ agent 执行 ↔ 状态流转 ↔ 中间态可观测"四环打通。

### 1.1 功能目标

1. 用户在 Kanban 点"Start"，任务从 `todo` 流转到 `in_progress`（或 `in_queue`，若有冲突）
2. 后端 agent 消费任务；根据执行结果流转至 `review`（成功）、`fail`（异常）、或 `in_queue`（运行中途抢锁失败，优雅暂停）
3. 在 Sessions 视图看 agent 的中间状态（进度、工具调用、diff、锁信息）
4. 全局体验符合 ADHD 友好原则：低认知负荷、状态三重编码、单主 CTA、log 默认折叠

### 1.2 非目标（v1 不做）

- Codex 式 attempt_total / is_review / env_label 字段扩展
- Cline 式 checkpoint per tool call 时间线
- Plan/Act 双模 gating
- 自动重试失败的任务（按用户决策：fail 必须人工 retry）
- 跨项目的全局队列（v1 每 project 独立队列）

---

## 2. 状态机

### 2.1 Task 状态枚举

在 `src/core/types-dashboard.ts` 中扩展：

```ts
type TaskStatus =
  | 'todo'         // 已创建，未启动
  | 'in_queue'     // ✨ 新增：冲突感知等待
  | 'in_progress'  // agent 正在执行
  | 'review'       // 已执行完毕，等用户 review diff/PR
  | 'fail'         // ✨ 新增：异常中断，必须人工 retry
  | 'done'         // PR 已合并
  | 'blocked'      // 保留：用户显式标注不可进展（非系统判定）
```

### 2.2 状态流转

**正常路径**（绿）：
- `todo` → 点 Start → 调度器检查冲突 → 无冲突 → `in_progress` → agent 完成 → `review` → 用户 Approve PR → `done`

**冲突调度路径**（橙）：
- `todo` → 点 Start → 调度器检查冲突 → 有冲突 → `in_queue`（记录 blocking tasks）
- 阻塞任务结束释放锁 → 唤醒 → `in_progress`
- `in_progress` 中途 Edit/Write 抢锁失败 → AgentSuspender 优雅暂停 → `in_queue`（保留 worktree 与已持有的锁）

**异常路径**（红）：
- `in_progress` → agent 进程崩溃 / 超时 / 被 kill / Sandbox 多次自纠正仍失败 → `fail`
- `fail` 只能由用户手动点 Retry 按钮重入 `in_progress`（不自动重试）

**Review 循环**：
- `review` → retry-with-feedback → `in_progress`（现有机制，保留）

### 2.3 为什么这么设计

- **in_queue 放在状态机的入口与中段两处**：入口保护未开工的任务不盲目起飞；中段保护已开工的 agent 不浪费已完成的工作（AgentSuspender 保留 worktree 状态）
- **fail 不自动重试**：用户决策。理由是异常往往意味着 prompt 本身有问题或环境有问题，盲目重试会浪费 token。用户看到 fail 后可以编辑 prompt、调整文件锁范围、再手动 Retry
- **Sandbox 失败不等于 fail**：Sandbox（lint/typecheck/test）失败时 agent 会自纠正 N 次（见 §4）。N 次仍失败才升级到 `fail`

---

## 3. 核心模块

三个新增后端模块，所有与 ProcessManager、WorktreeManager、StreamManager 并列。

### 3.1 Scheduler（任务调度器）

**文件**：`src/core/scheduler.ts`（新建）

**职责**：
- 接管 `/api/tasks/[id]/execute` 的调度决策
- 调用 LockManager 检查冲突
- 无冲突 → 交给 ProcessManager 启动 agent；写 `in_progress`
- 有冲突 → 写 `in_queue`，记录 `blocked_by`（数组形式的 task_id）
- 监听任务结束事件 → 遍历 `in_queue` 的任务 → 对每个检查其 `blocked_by` 是否全部 clear → 唤醒可启动的任务

**公开接口**：
```ts
interface Scheduler {
  requestStart(taskId: string, declaredPaths?: string[]): Promise<'in_progress' | 'in_queue'>;
  onTaskEnded(taskId: string): Promise<void>;  // 内部由 ProcessManager 事件触发
  suspendTask(taskId: string, reason: SuspendReason): Promise<void>;  // 由 AgentSuspender 触发
}
```

**并发上限**：v1 默认全局 3 个 in_progress（可在设置里改），超过时新任务即使无冲突也入队（排队策略：FIFO）。

### 3.2 LockManager（运行时文件锁）

**文件**：`src/core/lock-manager.ts`（新建，复用已有的 `file_locks` 表）

**职责**：
- 在 Edit / Write / Bash-with-file-args 工具调用**之前**申请锁
- 锁粒度：**文件路径**（v1 不做函数级 / 行块级）
- 锁生命周期：agent 会话级（worktree 释放时所有锁一并释放；也提供 `release(taskId, paths)` 显式释放）
- 冲突判定：若目标文件已被其他 active task 持有锁 → 抢锁失败

**Tool Call 拦截点**：
- ProcessManager 解析 stream-json 时识别到 `tool_use` 事件（Edit / Write / NotebookEdit / Bash 含 `>` 重定向等）
- 提取涉及的文件路径
- 在 tool_use 执行前向 LockManager `acquire(taskId, paths)`
- 失败 → 通知 AgentSuspender 优雅暂停

**`file_locks` 表使用**：
- 现有 schema 已有此表，v1 直接用。建议字段补齐：`task_id`、`file_path`、`acquired_at`、`released_at`（NULL 表示仍持有）
- 查询"某文件当前是否被持有"：`SELECT task_id FROM file_locks WHERE file_path = ? AND released_at IS NULL`

### 3.3 AgentSuspender（优雅暂停）

**文件**：`src/core/agent-suspender.ts`（新建）

**职责**：
- 接到"抢锁失败"信号时，向正在跑的 `claude -p` 进程发出暂停指令
- 方式：不 kill 进程；在 stream-json 的 input 端注入一个系统消息："请停止当前操作，当前工作将暂停并在冲突解除后恢复"，等待 agent 回到空闲（等待用户输入）
- 快照当前 claude session state（`claude_session_id`、最后一条 assistant message、pending tool_use）→ 写入 sessions 表
- 把任务状态改为 `in_queue`
- agent 进程本身暂时保留（也可杀掉，用 `claude --resume <session_id>` 恢复——见权衡）

**暂停模型权衡**（v1 决策）：
- 选 **B: 杀进程 + resume session**。理由：长时保留一个 claude 进程占内存；资源代价不值得 vs `claude --resume` 已经能无缝续跑
- v2 可考虑 A: 保留进程。需要 benchmark

**恢复流程**：
- Scheduler 发现任务解锁 → 重启 agent：`claude -p --resume <claude_session_id>` + 一条系统消息："阻塞已解除，继续原任务"
- ProcessManager 对 resume 场景已有支持（见现有代码 `claude_session_id` 字段），直接复用

### 3.4 Sandbox（自纠正循环）

**文件**：`src/core/sandbox.ts`（新建）

**职责**：
- 在 agent 报告"工作完成"信号之后立即跑配置的校验命令（早于写入 `review`）
- 项目级配置（`devlog.config.json` 的 `projects[].sandbox` 节）：`lint` / `typecheck` / `test` 的命令
- 逐条跑；任一 fail → 把输出（stderr + exit code）作为**新一轮 prompt 的上下文**追加到 agent，让 agent 自纠正
- 最多循环 N 次（v1 默认 N=2；可配置）
- N 次仍失败 → 升级任务状态到 `fail`

**配置示例**：
```json
{
  "id": "devlog",
  "path": "/Users/moose/Moose/DevLog",
  "sandbox": {
    "commands": [
      { "name": "typecheck", "cmd": "npm run typecheck" },
      { "name": "lint",      "cmd": "npm run lint" }
    ],
    "maxSelfFixIterations": 2
  }
}
```

**设计要点**：
- 命令在任务的 worktree 路径下执行，不污染主 checkout
- 输出截断到合理大小（如 8KB）避免撑爆 context
- 配置可选，缺省则跳过 Sandbox 直接进 `review`

---

## 4. 数据模型改动

### 4.1 tasks 表

现有字段保留。新增：
- `status`：扩展枚举（见 §2.1）——DB migration 负责字面量映射
- `blocked_by TEXT`：JSON 数组形式的 task_id 列表（仅在 `in_queue` 时非空，其他状态为 `NULL`）
- `sandbox_iterations INTEGER NOT NULL DEFAULT 0`：已消耗的自纠正次数
- `fail_reason TEXT`：人类可读的失败原因（`fail` 状态下必填，其他为 `NULL`）

### 4.2 file_locks 表

现有 schema 已有此表（`src/core/db-schema.ts` 中）。实施前先读当前 schema，与下列字段做 diff；缺失的由 migration 补齐：
- `task_id TEXT NOT NULL`
- `file_path TEXT NOT NULL`
- `acquired_at INTEGER NOT NULL`
- `released_at INTEGER`（NULL = 仍持有）
- 索引：`(file_path, released_at)`、`(task_id)`

### 4.3 sessions 表

无结构改动。`status` 字段可复用（现有 `pending / running / completed / failed`）。

---

## 5. API 改动

### 5.1 修改现有

- **`POST /api/tasks/[id]/execute`**：内部改为调用 `Scheduler.requestStart()`；返回体包含 `status: 'in_progress' | 'in_queue'` 与（若入队）`blocked_by: string[]`
- **`GET /api/tasks`**：返回体每个 task 附带 `blocked_by`、`fail_reason`
- **`GET /api/sessions/[id]/stream`**：SSE 事件流新增事件类型 `sandbox_start` / `sandbox_result` / `suspend` / `resume`

### 5.2 新增

- **`POST /api/tasks/[id]/retry`**（手动 retry fail 状态）：现有 retry 端点在 `review` 用；扩展让 `fail` 也能调用；逻辑：清空 `fail_reason`、`sandbox_iterations` → 进入 `requestStart` 流程
- **`GET /api/locks`**（可选）：列出当前所有活跃锁，供 UI 的 Locks tab 展示

### 5.3 不变

- PR 创建、worktree 创建、sessions/messages 等其它端点保持现状

---

## 6. 前端 UI 信息架构

### 6.1 Kanban 主视图

在现有 `src/components/kanban/board.tsx` 扩展：
- 列数从 4 增至 5（可能 6 若保留 `blocked`）：Todo / **In Queue** / In Progress / Review / **Fail** / Done
- Done 列默认折叠为单行"✓ Done · N"
- 顶栏新增：
  - 统计徽章："12 active · 2 in queue · 1 fail"
  - **Calm Mode** 切换（禁用所有自动滚动、动效降至 200ms、不闪烁）
  - **Needs me** 过滤器（只显示 `fail` 和 `review` 两状态）

### 6.2 任务卡片

- **状态徽标**：形状 + 颜色 + 文字三重编码（`● todo` / `⏳ in queue` / `▶ in progress` / `👀 review` / `❌ fail` / `✓ done`）
- **单一主 CTA**：卡片永远只暴露一个主按钮
  - Todo → `Start`
  - In Queue → `View blockers`（点开看阻塞任务；不提供直接启动——等调度器唤醒）
  - In Progress → `Open session`
  - Review → `Review →`
  - Fail → `Retry`（人工）
- **In Queue 卡片**：显示 `🔒 Blocked by: [task title]` 与 `📁 [file list]`
- **In Progress 卡片**：显示 `Step M/N · Sandbox: [status]` + 迷你进度条

### 6.3 Sessions Side Drawer（任务详情 Dialog 的扩展）

在现有 `src/components/kanban/task-detail-dialog.tsx` 或新建 `task-session-drawer.tsx` 中实现：

**从右侧滑入**，不跳页。宽度 ~420px。结构自上而下：

1. **Drawer Header**
   - 任务标题 + 状态徽标
   - worktree 名 / branch 名（小字）
   - 主 CTA（In Progress 下是 `⏸ Pause agent`；Review 下是 `Create PR`；Fail 下是 `↻ Retry`）

2. **Progress Steps**（Devin 式时间锚）
   - 7 段进度条（段数可变，由 agent 报告的"计划步骤数"决定；无计划时用工具调用数）
   - 每段可 hover 显示 step 名，点击跳到相应的 chat/tool 位置
   - 下方一行 meta："4/7 steps · 14m elapsed · 23k tokens"

3. **Tabs**
   - **Chat**（默认）：agent 的对话流；每条 user/assistant message
   - **Tools**（徽标显示累计次数）：工具调用卡片折叠列表（Cline 式），每张卡可展开看入参 + 结果
   - **Diff**（徽标显示 `+87/-34`）：worktree 当前累计的 diff（嵌入现有 `task-review-panel.tsx` 的 diff 组件）
   - **Locks**（徽标显示锁数）：本任务持有 / 被阻塞的锁列表

4. **流式输出默认折叠**
   - 当前正在执行的步骤显示"步骤标题 + spinner"一行
   - 下方"📜 Show streaming output"（默认折叠）→ 展开才看 token 流
   - **例外**：若出现 tool error 或 permission request → 自动展开 + 高亮

### 6.4 ADHD 原则落地清单

| 原则 | 落地 |
|---|---|
| 低信息密度 | 卡片 ≤5 数据点；Done 列折叠 |
| 状态三重编码 | 形状图标 + 颜色 + 文字 |
| 单主 CTA | 每卡片一个主按钮；次要操作进 `⋯` 菜单 |
| Side drawer 不跳页 | 任务详情不跳转整页 |
| Log 默认折叠 | 流式 token 默认隐藏 |
| Calm Mode | 顶栏开关，禁用动效/自动滚动 |
| "需要我"前置 | `Fail`/`Review` 两列置于主视线；Needs me 过滤器 |
| 完成微反馈 | 任务转入 `done` 时一次性 200ms 缩放 + 色淡入，不循环 |

### 6.5 前端实现策略

**由 Claude 直接实现**（不调用 frontend-design 技能）。
基于现有 shadcn / Radix / Tailwind 栈；复用 `@hello-pangea/dnd`、现有 task-review-panel 的 diff 组件、现有 SSE hook。
视觉细化（色彩、间距、字重）在实现 PR 时按 ADHD 原则迭代；每块 UI 变更先跑 dev server 手工验证。

---

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| agent 进程非零退出 | sessions.status=failed → task.status=`fail` + `fail_reason="Agent exit code N"` |
| claude CLI 未安装 / path 错误 | execute 端点返回 500 + 提示；不写入 task.status |
| 超时（可配置，默认 30 min） | 发 SIGTERM → 等 10s → SIGKILL；→ `fail` + `fail_reason="Timeout after 30m"` |
| 用户点 `⏸ Pause agent` | AgentSuspender 走暂停流程 → `in_queue`（blocked_by = user） |
| Sandbox 命令不存在 | 跳过该条；其它正常；日志里记 warning |
| Sandbox N 次仍失败 | `fail` + `fail_reason="Sandbox failed after 2 self-fix attempts: [last error summary]"` |
| 抢锁失败（中途） | AgentSuspender 暂停 → `in_queue` + `blocked_by=[taskId of lock holder]` |
| Worktree 操作失败 | 返回错误给调用方；task 保留 `todo` 不动 |
| SSE 断线 | 前端自动重连（现有机制）；不影响后端状态 |
| 死锁（A 中途被 B 阻塞，B 中途被 A 阻塞） | 运行时锁策略下，冲突是中途动态出现，无法启动时预检。v1 策略：AgentSuspender 每次要让任务进 `in_queue` 时遍历 blocked_by 图做环检测；若成环 → 环中"最晚持锁方"判定为死锁 → 强制把其状态标为 `fail` + `fail_reason="Deadlock: ..."`（人工介入），让环中其它任务得以推进 |

---

## 8. 测试策略

### 8.1 单元

- `scheduler.ts`：请求启动、冲突检测、唤醒逻辑、并发上限
- `lock-manager.ts`：acquire / release / 查询、并发抢锁
- `agent-suspender.ts`：暂停 + 恢复 roundtrip（mock ProcessManager）
- `sandbox.ts`：自纠正循环、超迭代次数升级 fail

### 8.2 集成

- 起两个任务声明冲突文件 → 第二个应进 `in_queue`；第一个结束后第二个自动唤醒
- 第一个任务执行中修改第二个任务目标文件 → 第二个仍应在第一个结束后才能开跑
- 跑一个任务故意让 typecheck 失败 → Sandbox 自纠正 → 第二次过 → `review`
- 跑一个任务让 typecheck 永远失败 → 2 次后 → `fail`
- Fail 状态点 Retry → 重新进 `in_progress`（不自动）

### 8.3 手工

- Kanban 在 Calm Mode 开/关下的视觉对比
- Side drawer 打开关闭不丢失状态
- 6+ 个任务同时跑时 UI 不卡
- Tab 切换、progress step 点击跳转都到位

---

## 9. 模块影响清单

| 文件 | 动作 |
|---|---|
| `src/core/types-dashboard.ts` | 扩展 `TaskStatus` 枚举、加字段 |
| `src/core/db-schema.ts` | tasks 表加 `blocked_by` / `sandbox_iterations` / `fail_reason`；file_locks 字段确认 |
| `src/core/scheduler.ts` | **新建** |
| `src/core/lock-manager.ts` | **新建** |
| `src/core/agent-suspender.ts` | **新建** |
| `src/core/sandbox.ts` | **新建** |
| `src/core/process-manager.ts` | tool_use 事件勾子：调用 LockManager.acquire；支持 resume |
| `src/app/api/tasks/[id]/execute/route.ts` | 改调 Scheduler.requestStart |
| `src/app/api/tasks/[id]/retry/route.ts` | 扩展支持 `fail` 源状态 |
| `src/app/api/locks/route.ts` | **新建**（可选） |
| `src/app/api/sessions/[id]/stream/route.ts` | 事件类型扩展（sandbox_*, suspend, resume） |
| `src/components/kanban/board.tsx` | 5/6 列；顶栏（Calm Mode、Needs me、统计徽章） |
| `src/components/kanban/task-card.tsx` | 新状态徽标；单主 CTA 逻辑 |
| `src/components/kanban/task-detail-dialog.tsx` | 扩展为 Session Drawer（或新建 task-session-drawer.tsx） |
| `src/components/kanban/task-review-panel.tsx` | 复用作为 Diff tab 内容 |
| `src/hooks/use-session-chat.ts` | 处理新 SSE 事件类型 |
| `devlog.config.json` | 项目节增加 `sandbox` 配置 |

---

## 10. 开放问题 / 延期事项

1. **是否引入 Plan-Confirm gate**（Sweep 式）：agent 输出计划后暂停等用户确认才开工。v1 延期——可能增加摩擦；先看无 gate 下自纠正循环 + 手工 fail retry 的体感
2. **Locks UI 的交互**：用户能否手动释放一个锁？能否在锁冲突时"我要强制抢锁"？v1 只读展示；v2 考虑
3. **死锁检测**：v1 是拒绝后者启动；v2 考虑更聪明的打破环
4. **跨项目锁**：v1 每 project 独立；若用户同时跑 DevLog + videoclaw 且两个项目引用同一共享库目录——v2 再议
5. **Sandbox 命令选择**：v1 按 `devlog.config.json` 显式配置；v2 可自动探测（package.json scripts / 常见配置）
6. **attempt_total / is_review 等 Codex 字段**：v2 考虑；schema 可预留
7. **Checkpoint per tool call**（Cline 式）：v2/v3；是杀手级但复杂度高
8. **Agent 输出的"计划步骤数"如何约定**：v1 用工具调用次数近似；v2 要求 agent 按特定协议输出 plan

---

## 11. 交付

- 本 spec 审阅通过 → 调用 `writing-plans` 技能生成实施计划
- 实施计划应按模块拆分、优先级排序（先后端 Scheduler + LockManager，再 AgentSuspender + Sandbox，最后前端 UI）
- 前端 UI 改造由 Claude 直接实现（不通过 frontend-design 技能）
- 每个实施 PR 需包含对应单元测试 + 至少一次 dev server 手工验证记录
