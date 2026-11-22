#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingOptions, repositoryRoot } from "./fork-features.mjs";
import { runCommand } from "./fork-process.mjs";

export const checks = [
  ["fork-features", "node", ["src/tooling/fork-features.mjs"]],
  ["rustfmt", "cargo", ["fmt", "--all", "--check"]],
  ["cargo-check", "cargo", ["check", "--workspace"]],
  ["cargo-test", "cargo", ["test", "--workspace"]],
  ["typecheck", "corepack", ["pnpm", "-r", "--if-present", "run", "typecheck"]],
  ["package-tests", "node", ["--test", "src/packages/*/test/*.test.ts"]],
  // Keep these tools tested on the same path as the existing desktop tests.
  [
    "tooling-tests",
    "node",
    [
      "--test",
      "src/apps/desktop/test/*.test.mjs",
      "src/tooling/test/*.test.mjs",
    ],
  ],
  ...["package-boundary", "platform-boundary", "test-paths", "file-size"].map(
    (name) => [name, "node", [`src/tooling/check-${name}.mjs`]],
  ),
];

export function runChecks({
  root = repositoryRoot,
  pendingTag,
  run = runCommand,
  log = console.log,
} = {}) {
  const results = [];
  for (const [name, command, baseArgs] of checks) {
    const args =
      name === "fork-features" && pendingTag
        ? [...baseArgs, "--pending-tag", pendingTag]
        : baseArgs;
    log(`\n>>> ${command} ${args.join(" ")}`);
    const started = Date.now();
    let status = 1;
    let error;
    try {
      if (name === "cargo-check")
        mkdirSync(resolve(root, "src/apps/desktop/src-tauri/resources"), {
          recursive: true,
        });
      const result = run(
        command === "node" ? process.execPath : command,
        args,
        { root, inherit: true },
      );
      status = result.status ?? 1;
      error = result.error?.message;
    } catch (failure) {
      error = failure.message;
    }
    if (error) log(error);
    results.push({
      name,
      command: [command, ...args].join(" "),
      status,
      error,
      durationMs: Date.now() - started,
    });
  }
  const failed = results.filter((result) => result.status !== 0).length;
  const summary = [
    "# Fork 检查结果",
    "",
    ...results.map(
      (result) =>
        `- ${result.status === 0 ? "PASS" : "FAIL"} ${result.name}: exit ${result.status}${result.error ? ` (${result.error})` : ""}`,
    ),
    "",
    `${results.length - failed}/${results.length} 通过。`,
  ].join("\n");
  log(`\n${summary}`);
  const directory = resolve(root, ".tmp");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, "fork-check-report.json"),
    `${JSON.stringify({ passed: failed === 0, results }, null, 2)}\n`,
  );
  writeFileSync(resolve(directory, "fork-check-report.md"), `${summary}\n`);
  return { passed: failed === 0, results };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = runChecks(pendingOptions(process.argv.slice(2))).passed
      ? 0
      : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
