import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { git } from "./fork-process.mjs";

export const sourceBranch = "feature/agent-team";
export const versionPath = "src/apps/desktop/src-tauri/tauri.conf.json";
const official = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function compareTags(a, b) {
  const left = a.slice(1).split(".").map(BigInt);
  const right = b.slice(1).split(".").map(BigInt);
  for (let at = 0; at < 3; at++) {
    if (left[at] !== right[at]) return left[at] > right[at] ? 1 : -1;
  }
  return 0;
}

export function upstreamTags(output) {
  const tags = new Map();
  // Peeled entries follow their annotated tag, and identify its commit.
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(\w+)\s+refs\/tags\/(v[^\s^]+)(?:\^\{\})?$/);
    if (match && official.test(match[2])) tags.set(match[2], match[1]);
  }
  return tags;
}

export function parseOptions(argv) {
  const options = { dryRun: false };
  for (let at = 0; at < argv.length; at++) {
    const flag = argv[at];
    if (flag === "--dry-run") options.dryRun = true;
    else if (["--tag", "--onto-branch"].includes(flag)) {
      const value = argv[++at];
      if (!value || value.startsWith("-")) throw new Error(`${flag} 需要值`);
      options[flag === "--tag" ? "tag" : "branch"] = value;
    } else throw new Error(`未知参数：${flag}`);
  }
  if (options.tag && !official.test(options.tag))
    throw new Error(
      "--tag 必须是官方稳定标签，例如 v0.6.12；不接受 fork 或预发布标签",
    );
  if (options.branch === sourceBranch)
    throw new Error(`目标分支必须是新分支，禁止使用 ${sourceBranch}`);
  return options;
}

export function syncPlan(root, options) {
  git(root, ["fetch", "upstream", "--tags"]);
  const tags = upstreamTags(git(root, ["ls-remote", "--tags", "upstream"]));
  const target = options.tag ?? [...tags.keys()].sort(compareTags).at(-1);
  if (!tags.has(target))
    throw new Error(`upstream 不存在官方稳定标签 ${target ?? "（无）"}`);
  const version = JSON.parse(
    readFileSync(resolve(root, versionPath), "utf8"),
  ).version;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-[1-9]\d*$/.test(version))
    throw new Error(
      `当前 fork 版本 ${version} 不符合 <官方版本>-<计数>，请确认基线`,
    );
  const baseline = `v${version.split("-")[0]}`;
  if (!tags.has(baseline))
    throw new Error(
      `基线 ${baseline} 不是 upstream 上存在的官方标签，请确认版本号`,
    );
  for (const tag of new Set([baseline, target])) {
    if (git(root, ["rev-parse", `refs/tags/${tag}^{commit}`]) !== tags.get(tag))
      throw new Error(`本地 ${tag} 与 upstream 标签不一致，请确认基线`);
  }
  const sourceVersion = JSON.parse(
    git(root, ["show", `${sourceBranch}:${versionPath}`]),
  ).version;
  if (sourceVersion.split("-")[0] !== version.split("-")[0])
    throw new Error(
      `当前版本 ${version} 与 ${sourceBranch} 的 ${sourceVersion} 基线不同`,
    );
  git(root, [
    "merge-base",
    "--is-ancestor",
    `refs/tags/${baseline}`,
    sourceBranch,
  ]);
  if (compareTags(target, baseline) < 0)
    throw new Error(`目标 ${target} 早于基线 ${baseline}，请确认标签`);
  git(root, [
    "merge-base",
    "--is-ancestor",
    `refs/tags/${baseline}`,
    `refs/tags/${target}`,
  ]);
  const commits = git(root, [
    "log",
    "--reverse",
    "--format=%H%x09%s",
    `${baseline}..${sourceBranch}`,
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, ...subject] = line.split("\t");
      return { hash, subject: subject.join("\t") };
    })
    .filter((commit) => !commit.subject.startsWith("Version this fork"));
  return {
    baseline,
    target,
    source: sourceBranch,
    branch: options.branch ?? `sync/${target}`,
    commits,
    replayed: [],
    conflicts: [],
  };
}

export function conflictsAt(root) {
  return git(root, ["diff", "--name-only", "--diff-filter=U", "-z"])
    .split("\0")
    .filter(Boolean)
    .map((path) => {
      let text = "";
      try {
        text = readFileSync(resolve(root, path), "utf8");
      } catch {
        /* Deleted sides have no conflict markers. */
      }
      const blocks = [...text.matchAll(/^<<<<<<<(?: |$)/gm)].length;
      const sharedKeys =
        path === "src/crates/core/src/lib.rs" ||
        /^src\/packages\/protocol\/locales\/.*\.json$/.test(path);
      return {
        path,
        blocks,
        hint: sharedKeys
          ? "默认设置/本地化清单可能在同一行两边新增键：先取上游内容，再追加 fork 的键；检查 agentTeams 等键仍在。"
          : "逐块人工核对两边改动，再 git add。",
      };
    });
}

export function writeSyncReport(root, report, log = console.log) {
  const lines = [
    "# Fork 同步报告",
    "",
    `状态：${report.status}`,
    `基线 → 目标：${report.baseline ?? "未知"} → ${report.target ?? "未知"}`,
    `分支：${report.branchCreated ? report.branch : `未创建${report.branch ? `（计划：${report.branch}）` : ""}`}`,
    `重放：${report.replayed?.length ?? 0}/${report.commits?.length ?? 0}`,
    `检查：${report.checks?.passed === true ? "PASS" : report.checks?.passed === false ? "FAIL" : "未运行"}`,
  ];
  if (report.error) lines.push("", report.error);
  if (report.failedCommit)
    lines.push(
      "",
      `失败提交：${report.failedCommit.hash} ${report.failedCommit.subject}`,
    );
  for (const conflict of report.conflicts ?? [])
    lines.push(
      `- ${conflict.path}：${conflict.blocks} 个冲突块。${conflict.hint}`,
    );
  if (report.status === "conflict")
    lines.push(
      "",
      "保留了 CHERRY_PICK_HEAD 和冲突状态。人工处理后 git add，再 git cherry-pick --continue；剩余提交按下面顺序重放，完成后重新运行 fork-check.mjs --pending-tag <目标标签>。",
      ...report.remaining.map(
        (commit) => `git cherry-pick ${commit.hash} # ${commit.subject}`,
      ),
    );
  if (report.status === "ready")
    lines.push(
      "",
      `下一步：人工把 ${versionPath} 的 version 改为 ${report.target.slice(1)}-1 并提交，再跑 node src/tooling/fork-check.mjs；确认后人工打标签并推送。`,
    );
  const text = `${lines.join("\n")}\n`;
  mkdirSync(resolve(root, ".tmp"), { recursive: true });
  writeFileSync(
    resolve(root, ".tmp/fork-sync-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(resolve(root, ".tmp/fork-sync-report.md"), text);
  log(text);
}
