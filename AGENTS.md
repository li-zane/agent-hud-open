# Agent HUD 二开（fork）维护规范

这个仓库是 Agent HUD 的二开版本，长期在这里维护。

## 仓库与分支

- `origin` = `li-zane/agent-hud-open`（我们的 fork），`upstream` = `jazzenchen/agent-hud-open`（官方）。
- 工作分支：`feature/agent-team`。`feature/agent-team-on-v0.6.7` 是基于 0.6.7 的旧版，只留作参考。
- **不向上游提 PR**。只推送到 `origin`。
- 本仓库目录：`C:\Users\zanez\Documents\agents_playground\agent-hud`（2026-11-22 前叫 `agent-hud-windows-fix`）。

## 二开内容（相对官方标签）

用 `git log --oneline <官方标签>..HEAD` 查看完整列表。目前有：

- `agent-team` 技能写入每个客户端（Claude、通用目录、Antigravity、DeepSeek），Claude Code 插件附带 `/team` 命令。
- HUD 会话区显示通过 agent 消息协作的会话（「协作中」）。
- 团队预设：设置 → 智能体里编辑（`agentTeams` 设置键，校验在 `core/src/agent_teams.rs`，读取在 `messaging/src/preferences.rs`），`list_sessions` 把它交给协调 agent，HUD 会话区显示一行并可点进设置。
- 正式构建像官方版一样接管客户端钩子（`main.rs` 传入 `canonical_executable`）。
- `.github/workflows/fork-release.yml`：fork 专用的 Windows MSVC 发布流程。上游自带的工作流不改，同步上游时不会在这里冲突。

## 版本号

- 格式 `v<官方版本>-<n>`，例如 `v0.6.8-1`、`v0.6.8-2`。
- 只有 `src/apps/desktop/src-tauri/tauri.conf.json` 的 `version` 带这个版本号；Cargo 和 npm 的清单保持上游的 `0.1.0`。
- **已推送的标签不能移动**。要改就把计数加一。

## 同步上游

1. 先跑 `node src/tooling/fork-sync.mjs --dry-run` 查看计划，再跑 `node src/tooling/fork-sync.mjs`。工具 fetch upstream，从最新的**官方稳定标签**（不是 `upstream/main`）新建 `sync/<标签>`，依次重放 `feature/agent-team` 的 fork 提交，跳过 `Version this fork` 版本提交。可用 `--tag v0.6.12 --onto-branch sync/v0.6.12-review` 指定标签和新分支；工具不改 `feature/agent-team`，也不改版本号、打标签或推送。
2. 冲突按 `.tmp/fork-sync-report.md`（机器可读版为同名 `.json`）处理；报告列出失败提交、文件、冲突块数和剩余提交。默认设置、本地化等清单冲突：先取上游内容，再追加 fork 的键。人工解决后 `git add`、`git cherry-pick --continue`，再按报告顺序重放剩余提交。
3. 跑 `node src/tooling/fork-check.mjs --pending-tag <新官方标签>`，一次汇总功能守卫、Rust 格式/编译/测试、TypeScript 类型/测试和仓库边界检查。新标签尚未手工加 fork 后缀时，显式的 `--pending-tag` 仅允许版本号等于该标签；正常工作树直接跑 `node src/tooling/fork-check.mjs`。报告在 `.tmp/fork-check-report.md` 和 `.json`。`node src/tooling/fork-features.mjs` 可单独检查二开功能及技能引用的工具名。
4. 检查通过后，人工把 `tauri.conf.json` 的版本计数从 `-1` 重新开始（例如 `0.6.12-1`）并提交；版本提交标题以 `Version this fork` 开头，便于下次同步跳过。再跑一次不带 `--pending-tag` 的 `fork-check.mjs`。审阅同步分支后，人工决定何时让 `feature/agent-team` 指向同步结果。
5. 最后人工打附注标签并推送（见「发布」）。同步改写历史时，分支推送用 `git push --force-with-lease origin feature/agent-team`；已推送的标签不移动。`.github/workflows/fork-sync-check.yml` 每日及手动在 Windows MSVC 上探测和检查，按目标标签创建或更新同名 issue，只报告结果，不推送分支、不打标签、不发版。

## 发布

1. 修改 `tauri.conf.json` 的版本号并提交。
2. 打附注标签并推送：`git tag -a vX.Y.Z-N -m "..."`，`git push origin feature/agent-team vX.Y.Z-N`。
3. `fork-release.yml` 在 `windows-latest` 上用 MSVC 构建，约 20–30 分钟，然后自动发布 Release，包括：
   - `*-unsigned-setup.exe`：完整安装包，给新用户安装用；
   - `*-app.exe`：只有主程序，用于升级已安装的版本；
   - `SHA256SUMS`、`provenance.json`。
4. 构建中有两道检查，任一失败就不发布：必须是 MSVC 编译的，程序不能导入 `WebView2Loader.dll` 或 `libunwind.dll`。

## 本地构建（只用于调试）

- 本机的 `rustc` 是独立安装的「Rust stable LLVM 1.94」（`x86_64-pc-windows-gnullvm`），它在 PATH 上排在 rustup 前面，本机也没有 MSVC Build Tools。用它编出的 exe 需要把 `WebView2Loader.dll`（来自 `target/release`）和 `libunwind.dll`（来自 `C:\Program Files\Rust stable LLVM 1.94\bin`）放在旁边，缺了会在 `main` 之前卡住，并弹出「找不到 DLL」的系统框。**正式版本一律走 GitHub Actions。**
- 本机没有 `bun`，所以只构建桌面端：

  ```
  corepack pnpm --filter @agent-hud/desktop exec tauri build --no-bundle --config <一个 JSON，把 beforeBuildCommand 改成 "corepack pnpm run build">
  ```

  并准备一个空的 `src/apps/desktop/src-tauri/resources` 目录。
- 目录改名后，`target/` 里的 Rust 缓存可能会触发一次完整重编，这是正常的。

## 升级本机安装

- 安装位置：`C:\Application\Agent HUD\`。
- **只用 Release 里的 `*-app.exe`**，不要运行 `setup.exe`，它会覆盖 Antigravity 兼容层。
- **不要动** `agent-hud-engine.exe` 和 `windows-compat\`：它们是 Antigravity 兼容层，指向 `original-engine.exe` 和 `antigravity-delegate-mcp`。
- 替换步骤：
  1. 先核对 `SHA256SUMS`。
  2. 把正在运行的 `Agent HUD.exe` 改名移开，再复制进新的 exe。
  3. 只重启主程序，不要动带 `--mcp` 的桥接进程。用 explorer 启动。
  4. 判断启动正常：内存超过 60 MB、有一个 WebView 子进程、两个 `instance.lock` 都被占用。
- 官方 0.6.7 保留为 `Agent HUD.exe.pre-fork`。退回方法：退出 HUD，删掉 `Agent HUD.exe`，再把 `.pre-fork` 改回原名。
- fork 版的数据在 `%LOCALAPPDATA%\app.agenthud.windows`（官方版用的是 `AgentHUDPrivate`）。换版本后，已经开着的 Claude Code 会话要执行一次 `/reload-plugins` 才能连上。

## 临时文件

- 临时文件放在仓库内的 `.tmp/`（已写入 `.git/info/exclude`，不会被提交），任务结束后清理。
