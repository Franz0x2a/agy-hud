# agy-hud

**不用再问，随时看清 Antigravity 正在做什么。**

agy-hud 是一款 Antigravity 原生实时状态栏：上下文占用、额度剩余、重置
倒计时、Agent 状态、工具、子 Agent 与 Plan 进度，始终显示在输入框下方。
无需 tmux，也不用额外窗口。

[![版本](https://img.shields.io/badge/version-0.2.1-7c3aed)](https://github.com/lllopic/agy-hud/releases)
[![Antigravity CLI](https://img.shields.io/badge/Antigravity_CLI-1.0.2%E2%80%931.1.22%2B-4285f4)](https://antigravity.google/docs/cli/statusline/)
[![测试](https://img.shields.io/badge/tests-619_passing-22c55e)](#开发)
[![许可证](https://img.shields.io/github/license/lllopic/agy-hud)](LICENSE)
[![Stars](https://img.shields.io/github/stars/lllopic/agy-hud)](https://github.com/lllopic/agy-hud/stargazers)

> [English](README.md) · 简体中文

```text
AGY · Gemini 3.5 Pro · READY · planning · agy-hud git:(main*)
上下文 █░░░░░░░░░ 14.2% (84k/1.0M) │ 额度 █░░░░░░░░░ 剩余 93.8% (重置剩余 6d 11h)
◐ grep_search: normalizeStatusPayload │ ✓ run_command ×2
▸ 渲染原生额度 (2/5)
```

## 为什么是 agy-hud

- **上下文数据以官方为准**：优先采用 Antigravity 自带的小数百分比和窗口
  大小，不再靠旧逻辑猜测。
- **额度一眼看懂**：直接显示你关心的“剩余 93.8%”，同时给出重置倒计时。
- **真正理解 Antigravity 活动**：支持 planner/action 事件、工具错误、
  `invoke_subagent`、Skill 与 MCP 调用，不再套用不匹配的 Claude 日志格式。
- **真实 Plan 进度**：安全读取当前会话 `task.md` 的复选框状态。
- **覆盖现代 CLI 状态**：支持 Agent 状态、执行模式、git/jj/hg VCS、sandbox、artifact、
  task/input 数量、确认等待、Vim 模式、套餐、账号、CLI 版本、原生费用和子 Agent。
- **快、轻、纯本地**：没有运行时依赖、联网请求、分析或遥测；输入与 artifact
  有大小限制，transcript 使用缓存且只读取最近 2 MiB。长会话仍保留真实开始时间；
  无法得到可信全会话累计值时，不会显示误导性的 session token。

## 安装

要求：Antigravity CLI、Node.js 18 或更高版本。

先在终端安装原生插件：

```bash
agy plugin install https://github.com/lllopic/agy-hud
```

然后打开 Antigravity CLI，运行：

```text
/agy-hud-setup
```

完成后重启 Antigravity CLI。setup 会生成并验证使用绝对路径的稳定包装器，避免
shell 变量展开和旧版本缓存路径让 HUD 失效。

从 v2 之前的配置升级时，setup 会自动将原文件备份为
`~/.gemini/antigravity-cli/plugins/agy-hud/config.v1.backup.json`，启用新版
Essential 的上下文与额度语义，同时保留语言、颜色、高级选项和未知字段。配置一旦
标记为 v2，后续重装会尊重你的显式选择。

以后要切换预设、语言或布局，运行：

```text
/agy-hud-configure
```

## 三种预设

### Essential（默认推荐）

零配置即启用高价值信息：

- 模型、Agent 状态、执行模式
- 项目与原生分支/脏状态
- 上下文百分比和 token 数量
- 额度剩余和重置倒计时
- 活跃时显示工具、子 Agent 与 Plan 进度

首次模型响应前，上下文显示为 `-- / 1.0M · 等待首次响应`，不会把刚初始化的
会话误写成精确的 `0%`。

### Full（当前原生字段全部打开）

在 `/agy-hud-configure` 中选择 **Full**，或把下面配置合并到
`~/.gemini/antigravity-cli/plugins/agy-hud/config.json`：

```json
{
  "display": {
    "showCost": true,
    "showDuration": true,
    "showSessionTokens": true,
    "showSandbox": true,
    "showArtifacts": true,
    "showTaskCount": true,
    "showPendingInput": true,
    "showToolConfirmation": true,
    "showVimMode": true,
    "showPlanTier": true,
    "showAccount": true,
    "showAntigravityVersion": true,
    "showSkills": true,
    "showMcpActivity": true
  }
}
```

`showAccount` 会把账号邮箱显示在终端中，因此默认关闭；直播或共享屏幕时建议
保持关闭。

### Minimal

只保留模型、项目/VCS 和上下文；关闭活动项后也会跳过 transcript、artifact 和
旧配置计数读取，适合更在意纵向空间与开销的用户。

## 原生字段覆盖

| Antigravity 数据 | Essential | Full | 数据来源 |
|---|:---:|:---:|---|
| 模型、工作区、VCS | ✓ | ✓ | 原生状态载荷 |
| 上下文大小、token、小数占用率 | ✓ | ✓ | 原生状态载荷 |
| 额度剩余与重置时间 | ✓ | ✓ | 原生状态载荷 |
| Agent 状态与执行模式 | ✓ | ✓ | 原生状态载荷 |
| 工具、错误、子 Agent | 活跃时 | ✓ | transcript + 原生数量 |
| Plan 进度 | 活跃时 | ✓ | 当前会话 `task.md` |
| 原生费用 | — | ✓ | 原生状态载荷 |
| Sandbox 与网络权限 | — | ✓ | 原生状态载荷 |
| Artifact、task、待输入数量 | — | ✓ | 原生状态载荷 |
| 工具确认与 Vim 模式 | — | ✓ | 原生状态载荷 |
| 套餐、账号、CLI 版本 | — | ✓ | 原生状态载荷 |
| Skill 与 MCP 活动 | — | ✓ | transcript 事件 |

未来新增的未知字段会被安全忽略；可选字段只在当前 Antigravity 版本实际提供时
显示。因此同一个 agy-hud 版本可以通过能力检测兼容新旧 CLI，而不是依赖脆弱的
版本号判断。

## 配置

推荐使用引导命令：

```text
/agy-hud-configure
```

手动配置文件位于：

```text
~/.gemini/antigravity-cli/plugins/agy-hud/config.json
```

常用选项：

| 选项 | 默认值 | 作用 |
|---|---:|---|
| `language` | `en` | `en`、`zh` 或 `zh-Hans` |
| `lineLayout` | `expanded` | 多行 `expanded` 或单行 `compact` |
| `display.contextValue` | `both` | `percent`、`tokens`、`remaining` 或 `both` |
| `display.usageValue` | `remaining` | 额度/限额数值语义 |
| `display.showTools` | `true` | 最近及正在运行的工具 |
| `display.showAgents` | `true` | 正在运行/最近完成的子 Agent |
| `display.showTodos` | `true` | 当前 Plan 任务及进度 |
| `display.timeFormat` | `relative` | `relative`、`absolute` 或 `both` |
| `gitStatus.showAheadBehind` | `false` | 查询本地 Git 远端差异 |
| `gitStatus.showFileStats` | `false` | 查询本地 Git 文件变化 |
| `maxWidth` / `forceMaxWidth` | `null` / `false` | 宽度回退值或强制宽度 |

完整的类型化选项和默认值见 [`src/config.ts`](src/config.ts)。旧的
`showClaudeCodeVersion` 与 `CLAUDE_CONFIG_DIR` 仍作为迁移兼容别名使用，且会
回退读取旧的 `plugins/claude-hud/config.json`。

Antigravity 还支持 `statusLine.stack_with_default`。如果想把 agy-hud 与官方默认
状态栏上下叠放，可在 CLI 的 `settings.json` 中设为 `true`。

## 工作原理

```text
Antigravity 状态 JSON ─┐
Transcript JSONL ───────┼─> 规范化 ─> RenderContext ─> 终端 HUD
当前会话 task.md ───────┘
```

上下文、额度、VCS、费用和运行状态以原生状态载荷为权威来源；transcript 与
artifact 只用于补充实时活动和 Plan 进度。所有数据都留在本机。

## 常见问题

**HUD 没有出现**

1. 确认 `node --version` 为 18+。
2. 再运行一次 `/agy-hud-setup`。
3. 检查 `settings.json` 是否指向生成的绝对路径
   `agy-hud-statusline.sh` 或 `.cmd` 包装器。
4. 完全退出并重启 Antigravity CLI。

**额度或某个 Full 字段没有显示**

agy-hud 不会伪造不存在的数据。请更新 Antigravity CLI，并确认当前版本的状态
载荷确实提供该字段；较旧版本仍会正常显示其支持的部分。

**升级后还是旧外观**

已有的 `config.json` 会有意覆盖新的 Essential 默认值。运行
`/agy-hud-configure` 重新选择 Essential，或暂时移走配置文件测试新默认效果。

## 开发

```bash
npm install
npm test
```

测试覆盖 1.1.22 风格原生载荷、旧版本兼容、transcript 活动配对、artifact 会话
隔离、终端宽度、安全清洗，以及中英文渲染。

## 致谢

agy-hud 最初由 [claude-hud](https://github.com/jarrodwatts/claude-hud)
适配而来，其成熟的渲染、配置与状态栏设计仍是重要基础。0.2.0 已将旧的
Claude 数据链路替换为 Antigravity 原生状态、额度、transcript 与 artifact 支持。

项目采用 MIT 许可证，欢迎提交 Issue 和贡献代码。
