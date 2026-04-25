# 按项目划分的本地存储 — 架构升级 Spec

**日期**：2026-04-25
**作者**：Moose（产品方向）+ Claude（架构）
**状态**：待评审
**关联 spec**：`2026-04-23-task-agent-orchestration-design.md`（Plan A 的状态机/调度器/锁管理仍生效）
**关联代码**：`src/core/db.ts`、`src/core/db-schema.ts`、`src/core/config.ts`、`src/app/api/**`

---

## 1. 目标

DevLog 当前是「单 DB 文件，多项目按 `project_id` 列分区」。要升级为「**每项目独立 SQLite 文件 + 全局 registry**」，让 Dashboard 用户能：

1. **注册新项目**：在 UI 点按钮 → 自动创建该项目的 `.devlog/devlog.db`、登记到 registry、出现在 Kanban 项目切换器
2. **扫描文件系统注册项目**：指定根目录 → 自动发现 git repo → 批量登记
3. **任务长期持久化在项目内**：每个项目的 tasks / sessions / file_locks / session_logs / session_messages 都存在该项目的 `.devlog/devlog.db` 内，可随项目目录一起移动 / 备份 / 分享
4. **Dashboard 用户只接触项目和任务管理层**，不接触 DB 路径、连接池、迁移这些底层细节

### 1.1 v1 非目标

- 跨项目聚合查询（如"我所有项目的 in_progress 任务总数"）
- 按需自动监听文件系统（chokidar 持续监控）—— 仅支持手动触发扫描
- 项目级 schema 漂移（不同项目用不同 schema 版本）—— 全部强制升级到最新 schema
- 删除 `project_id` 列 —— 保留为冗余字段，避免破坏现有 SQL 查询；每个 DB 内值都相同

---

## 2. 文件布局

```
~/.config/devlog/
├── registry.sqlite                    # 全局 registry（项目列表 + 全局设置）
└── (no per-project data here)

<project_path>/                        # 例如 /Users/moose/Moose/devlog
└── .devlog/
    ├── devlog.db                      # 该项目所有任务/会话/锁/日志
    ├── devlog.db-wal                  # SQLite WAL 文件
    ├── devlog.db-shm                  # SQLite 共享内存文件
    └── logs/                          # session 输出日志（沿用现有结构）

# devlog.config.json 仍存在但角色降级：
# - 存放跨会话设置（active project、port 等）
# - 项目列表的 source of truth 转给 registry.sqlite，但保留双向同步以便用户手编 JSON
```

**每个项目自己 `.gitignore` 里加 `.devlog/`**（v1 不动用户的 .gitignore，由 README 说明）。

---

## 3. 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│ Dashboard / API                                                     │
│  - GET /api/projects        ← list from registry                    │
│  - POST /api/projects       ← register new (creates .devlog/)       │
│  - POST /api/projects/scan  ← walk dir, return discovered repos     │
│  - GET /api/tasks?project=X ← routes to per-project DB              │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ src/core/registry.ts                                                │
│  - createProject({ id, name, path, defaultBranch })                 │
│  - listProjects()                                                   │
│  - getProject(id) / removeProject(id)                               │
│  - scanFilesystem(rootPath) → ProjectCandidate[]                    │
│  - syncFromConfigJson() / syncToConfigJson()                        │
└─────────────────────────────────────────────────────────────────────┘
              │ uses
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ src/core/db-pool.ts                                                 │
│  - getRegistryDb()  → ~/.config/devlog/registry.sqlite              │
│  - getProjectDb(projectId) → <project_path>/.devlog/devlog.db       │
│    (lazy open + LRU cache, max N concurrent connections)            │
│  - closeAll() / closeProject(projectId)                             │
└─────────────────────────────────────────────────────────────────────┘
              │ wraps
              ▼
        better-sqlite3
```

---

## 4. 核心模块

### 4.1 `src/core/db-pool.ts`（新建）

**职责**：统一所有 SQLite 连接的生命周期。Lazy open + LRU close（避免无界文件句柄）。

```ts
export interface DbPool {
  getRegistry(): Database.Database;
  getProject(projectId: string): Database.Database;
  closeProject(projectId: string): void;
  closeAll(): void;
}

export function createDbPool(opts?: { maxOpen?: number }): DbPool;
```

**实现要点**：
- Registry path 固定 `~/.config/devlog/registry.sqlite`（用 `os.homedir()`）
- Project DB path 从 registry 查出 `project.path` → 拼 `<path>/.devlog/devlog.db`
- 打开时跑 `db.exec(SCHEMA)` + `migrateTasksV2(db)`（保留 Plan A 的迁移）
- `maxOpen` 默认 8；超出后用 LRU 关掉最久未用的（带 sync 到 disk）
- 进程退出时 `closeAll()`（`SIGINT`/`SIGTERM` hook）

**取代**：旧 `getDb()` 单例改为 `getProject(projectId)` 调用。

### 4.2 `src/core/registry.ts`（新建）

**职责**：项目元数据 CRUD + 文件系统扫描。

```ts
export interface ProjectRecord {
  id: string;                  // 唯一 slug，如 "videoclaw"
  name: string;                // 显示名
  path: string;                // 绝对路径
  defaultBranch: string;       // 通常 'main'
  createdAt: string;
  lastActiveAt: string | null;
}

export interface ProjectCandidate {
  suggestedId: string;
  name: string;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
}

export interface Registry {
  list(): ProjectRecord[];
  get(id: string): ProjectRecord | null;
  create(input: Omit<ProjectRecord, 'createdAt' | 'lastActiveAt'>): ProjectRecord;
  remove(id: string): void;          // 不删 .devlog/ 目录，只移出 registry
  touchActive(id: string): void;     // 更新 lastActiveAt
  scan(rootPath: string, opts?: { maxDepth?: number }): ProjectCandidate[];
  syncFromConfigJson(): { added: string[]; skipped: string[] };
  syncToConfigJson(): void;
}

export function createRegistry(pool: DbPool): Registry;
```

**实现要点**：
- `create`：(1) 写 registry 表 (2) 调 `pool.getProject(id)` 触发 lazy 打开 → 创建 `<path>/.devlog/devlog.db` (3) `syncToConfigJson()` 同步
- `scan`：递归遍历，深度上限默认 4，在每个目录检测 `.git/` → ProjectCandidate；用户在 UI 选要登记哪些再批量 create
- `syncFromConfigJson`：启动时跑一次，把 JSON 里有但 registry 里没有的项目登记上（迁移路径）
- `syncToConfigJson`：每次 create/remove 后写回 JSON 让用户能版本控制项目列表

**Registry 表 schema**（写在 `db-schema-registry.ts`）：
```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.3 `src/core/db.ts`（改造）

把 `getDb(): Database` 改成 `getDb(projectId: string): Database`，内部调 `dbPool.getProject(projectId)`。  
保留 `migrateTasksV2(db)` 函数原状（每次 `pool.getProject` 打开新连接时仍会调用）。  
保留 `recoverOrphanedSessions(db)` 但改成 per-project：每次 lazy open 时跑一次该项目的恢复。

### 4.4 `src/core/config.ts`（改造）

- 仍负责读 `devlog.config.json`
- `activeProject` / `port` 等设置保留在 JSON
- `projects` 字段角色降级为 registry 的镜像；启动时通过 `registry.syncFromConfigJson()` 引导

### 4.5 `src/core/__tests__/db-pool.test.ts` & `registry.test.ts`（新建）

完整 TDD 覆盖。

---

## 5. API 改动

### 5.1 新增

- **`GET /api/projects`** → `ProjectRecord[]`
- **`POST /api/projects`** → 注册新项目；body: `{ id, name, path, defaultBranch? }`；返回 `ProjectRecord`
- **`POST /api/projects/scan`** → body: `{ rootPath, maxDepth? }`；返回 `ProjectCandidate[]`（不自动注册）
- **`POST /api/projects/scan/register`** → body: `{ candidates: ProjectCandidate[] }`；批量注册返回结果
- **`DELETE /api/projects/[id]`** → 移出 registry（不删数据文件）
- **`POST /api/projects/[id]/activate`** → 设为 active；调 `registry.touchActive(id)`，写 JSON

### 5.2 现有路由改造

所有现有 `/api/tasks/*`、`/api/sessions/*`、`/api/worktrees/*`、`/api/locks/*` 端点：
- 接受 `?project=<id>` query param 或 `X-Project-Id` header
- 缺省时取 `activeProject`（来自 JSON config）
- 内部 `getDb()` 调用替换为 `getDb(projectId)`

向后兼容：端点签名不变（依赖 active project 仍能跑），仅新增可选参数。

---

## 6. 数据迁移（现有 videoclaw 数据）

**当前**：`/Users/moose/Moose/DevLog/data/devlog.db`（128 KB，29 个 videoclaw 任务）

**目标**：搬到 `/Users/moose/Moose/videoclaw/.devlog/devlog.db`（path 来自 devlog.config.json 中 `videoclaw` 项目的 `path`）

**迁移脚本**（`scripts/migrate-to-per-project.ts`）：
1. 读 `devlog.config.json` 列出所有项目
2. 对每个项目 `p`：
   - 创建 `<p.path>/.devlog/` 目录
   - 用 `better-sqlite3` 打开旧 DB 与新 DB
   - `INSERT INTO new.tasks SELECT * FROM old.tasks WHERE project_id = p.id` 等（5 张表）
   - 输出 "videoclaw: 29 tasks migrated"
3. 旧 DB 重命名为 `data/devlog.db.legacy`（不删，保留兜底）
4. 把所有 project 注册到 registry

**幂等**：迁移脚本 detect 新 DB 已有数据则 skip。可重复运行。

**回滚**：rename 回 `data/devlog.db`，停服重启即可恢复旧路径。

---

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| 项目目录不存在 | API 返回 400 + "Project path does not exist: /foo/bar" |
| 项目目录无写权限 | API 返回 500 + "Cannot create .devlog/ in /foo/bar" |
| 重复注册（id 或 path 已存在） | API 返回 409 + 现有 ProjectRecord |
| Scan 路径不存在 / 无权限 | API 返回 400 + 错误说明，列出已扫到的 candidates |
| Active project 在 registry 中找不到 | 启动时 fallback 到第一个 project；warn 日志 |
| Per-project DB 文件损坏 | API 返回 500 + 提示用户恢复或重建；不自动覆盖 |
| LRU 超容关闭某个 DB 时 | 透明：下次访问 lazy open；如果有未提交事务会被回滚（应该不会，因为 better-sqlite3 同步） |

---

## 8. 测试策略

### 8.1 单元

- `db-pool.test.ts`：lazy open 行为、LRU 关闭、registry/project 路径分离、关闭后 reopen
- `registry.test.ts`：CRUD、scan 找 git repo、syncFromConfigJson 幂等、create 创建 .devlog/devlog.db 文件

### 8.2 集成

- `migrate-to-per-project.test.ts`：模拟旧 DB → 跑迁移 → 验证新 DB 内容、旧 DB 重命名、registry 登记

### 8.3 手工

- 在浏览器创建新项目 → 看到 `.devlog/devlog.db` 出现在选择的目录
- 扫描 `~/Moose/` → 看到候选列表
- 切换 active project → 任务列表切换
- DB 文件可整个目录复制到另一台机器 + 注册 → 任务原样可见

---

## 9. 模块影响清单

| 文件 | 动作 |
|---|---|
| `src/core/db-pool.ts` | **新建** |
| `src/core/registry.ts` | **新建** |
| `src/core/db-schema-registry.ts` | **新建**（registry 专用 schema） |
| `src/core/db.ts` | 改造：`getDb(projectId)` 替代 `getDb()` |
| `src/core/config.ts` | 改造：active project 读写、初始化时同步 registry |
| `src/core/types-project.ts` | 加 `ProjectRecord`、`ProjectCandidate` 类型 |
| `src/core/__tests__/db-pool.test.ts` | **新建** |
| `src/core/__tests__/registry.test.ts` | **新建** |
| `src/app/api/projects/route.ts` | **新建**（GET / POST） |
| `src/app/api/projects/[id]/route.ts` | **新建**（DELETE） |
| `src/app/api/projects/[id]/activate/route.ts` | **新建** |
| `src/app/api/projects/scan/route.ts` | **新建** |
| `src/app/api/projects/scan/register/route.ts` | **新建** |
| `src/app/api/tasks/**` | 改造：`getDb(projectId)`、读 `?project=` |
| `src/app/api/sessions/**` | 同上 |
| `src/app/api/worktrees/**` | 同上 |
| `src/app/api/locks/**` | 同上 |
| `scripts/migrate-to-per-project.ts` | **新建**（一次性迁移工具） |

**估算**：5 新模块 + ~12 改造文件 + 1 迁移脚本。

---

## 10. 与 Plan A 的关系（重要）

Plan A 的 backend 已写到 Phase 2（schema 扩展 + LockManager）。本架构升级**保留 Plan A 已写的 schema 和 LockManager**，仅替换 DB 入口：

- `LockManager`、`Scheduler`（Phase 3 待写）、`AgentSuspender`（Phase 5 待写）等模块的构造函数都接受 `db: Database` 入参——这意味着它们**与"DB 是哪来的"解耦**
- 改造仅在 API 入口处：`getScheduler(projectId)` 等 singleton 改成 per-project
- Plan A 剩余 Phase 3-9 的实现可以直接基于新架构编写（**零返工**）

---

## 11. 开放问题 / 延期

1. **`.devlog/` 是否应自动 `.gitignore`**：v1 不动；v2 如果调研发现用户经常把 `.devlog/devlog.db` 误 commit，再加自动 gitignore 写入
2. **Registry DB 备份策略**：v1 依赖用户手动备份 `~/.config/devlog/`；v2 考虑命令 `devlog backup`
3. **跨项目聚合视图**：v1 不做；v2 可以在 registry 表加一张 `project_summaries` 缓存表，由后台任务定期更新
4. **持续扫描（chokidar）**：v1 仅按需扫描；v2 看使用频次决定要不要常驻
5. **多机器同步**：v1 不解决；如果项目目录在 iCloud / Dropbox 下，依赖文件系统同步（SQLite WAL 在 sync 工具下可能有问题，需 doc warning）
6. **Project 删除时是否删除 .devlog/**：v1 只移出 registry 不删数据；v2 提供 "purge" 模式

---

## 12. 交付

- 本 spec 评审通过 → writing-plans 生成实施计划
- 实施过程中：每个 code commit 推到 origin/feat/per-project-storage；spec/plan commits 不推
- 完成后切回 feat/task-agent-orchestration-backend 继续 Plan A Phase 3+（基于新 DB 架构）
