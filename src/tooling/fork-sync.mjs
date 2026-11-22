#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repositoryRoot } from "./fork-features.mjs";
import { runChecks } from "./fork-check.mjs";
import { git, runCommand } from "./fork-process.mjs";
import {
  conflictsAt,
  parseOptions,
  syncPlan,
  writeSyncReport,
} from "./fork-sync-state.mjs";

export function runSync({
  root = repositoryRoot,
  argv = [],
  log = console.log,
  check = runChecks,
} = {}) {
  let report = { status: "failed", exitCode: 1, branchCreated: false };
  try {
    const options = parseOptions(argv);
    report = { ...report, ...syncPlan(root, options) };
    if (report.target === report.baseline) {
      log(`已是最新：${report.baseline}。`);
      report.status = "up-to-date";
      report.exitCode = 0;
    } else {
      log(
        `${report.baseline} → ${report.target}，待重放 ${report.commits.length} 个 fork 提交：`,
      );
      for (const commit of report.commits)
        log(`${commit.hash} ${commit.subject}`);
      git(root, ["check-ref-format", "--branch", report.branch]);
      if (
        runCommand(
          "git",
          ["show-ref", "--verify", "--quiet", `refs/heads/${report.branch}`],
          { root },
        ).status === 0
      )
        throw new Error(`目标分支 ${report.branch} 已存在，请换一个新分支`);
      if (options.dryRun) {
        report.status = "planned";
        report.exitCode = 0;
        log("dry-run：只列出计划，未创建分支、未重放或运行检查。");
      } else {
        if (git(root, ["status", "--porcelain"]))
          throw new Error(
            "工作树有未提交改动，请先提交或用 git stash 保存后重试；未切换分支",
          );
        git(root, [
          "switch",
          "-c",
          report.branch,
          `refs/tags/${report.target}`,
        ]);
        report.branchCreated = true;
        for (const [index, commit] of report.commits.entries()) {
          const picked = runCommand("git", ["cherry-pick", commit.hash], {
            root,
          });
          if (picked.status !== 0) {
            report.failedCommit = commit;
            report.remaining = report.commits.slice(index + 1);
            report.conflicts = conflictsAt(root);
            report.status = report.conflicts.length ? "conflict" : "failed";
            report.error = `cherry-pick 退出 ${picked.status}：${picked.stderr || picked.stdout}`;
            writeSyncReport(root, report, log);
            return report;
          }
          report.replayed.push(commit);
        }
        report.checks = check({ root, pendingTag: report.target, log });
        report.status = report.checks.passed ? "ready" : "checks-failed";
        report.exitCode = report.checks.passed ? 0 : 1;
      }
    }
  } catch (error) {
    report.status = "failed";
    report.exitCode = 1;
    report.error = error.message;
  }
  writeSyncReport(root, report, log);
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runSync({ argv: process.argv.slice(2) }).exitCode;
}
