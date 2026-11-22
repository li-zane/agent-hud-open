import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runSync } from "../fork-sync.mjs";
import { git } from "../fork-process.mjs";
import {
  compareTags,
  parseOptions,
  sourceBranch,
  upstreamTags,
  versionPath,
} from "../fork-sync-state.mjs";
import { read, syncFixture, write } from "./fork-fixture.mjs";

const quiet = () => {};
const protectedHead = (fixture) =>
  assert.equal(
    git(fixture.root, ["rev-parse", sourceBranch]),
    fixture.sourceHead,
  );

test("official tag sorting excludes fork and prerelease tags and peels annotations", () => {
  const tags = upstreamTags(
    "aaa refs/tags/v1.2.9\nbbb refs/tags/v1.2.10\nccc refs/tags/v1.2.10^{}\nddd refs/tags/v1.2.10-1\neee refs/tags/v2.0.0-beta.1\n",
  );
  assert.deepEqual([...tags.keys()].sort(compareTags), ["v1.2.9", "v1.2.10"]);
  assert.equal(tags.get("v1.2.10"), "ccc");
});

test("invalid arguments cannot target the protected branch or fork tags", () => {
  for (const argv of [
    ["--tag"],
    ["--tag", "v1.2.3-1"],
    ["--tag", "v1.2.3-beta.1"],
    ["--onto-branch", sourceBranch],
    ["--unknown"],
  ])
    assert.throws(() => parseOptions(argv));
});

test("already up to date exits zero without checking or changing branches", (t) => {
  const fixture = syncFixture(t, { newer: false });
  const output = [];
  const report = runSync({
    root: fixture.root,
    log: (line) => output.push(line),
    check: () => assert.fail("unexpected checks"),
  });
  assert.equal(report.exitCode, 0);
  assert.equal(report.status, "up-to-date");
  assert.match(output.join("\n"), /已是最新/);
  assert.equal(git(fixture.root, ["branch", "--show-current"]), sourceBranch);
  protectedHead(fixture);
});

test("dry-run fetches official tags but never creates a branch or replays version commits", (t) => {
  const fixture = syncFixture(t);
  const report = runSync({
    root: fixture.root,
    argv: ["--dry-run"],
    log: quiet,
    check: () => assert.fail("unexpected checks"),
  });
  assert.equal(report.status, "planned");
  assert.equal(report.target, "v1.2.10");
  assert.deepEqual(
    report.commits.map((commit) => commit.hash),
    [fixture.featureCommit],
  );
  assert.equal(git(fixture.root, ["branch", "--show-current"]), sourceBranch);
  assert.equal(git(fixture.root, ["branch", "--list", "sync/*"]), "");
  protectedHead(fixture);
});

test("successful replay checks the target but leaves versioning, source and tags alone", (t) => {
  const fixture = syncFixture(t);
  let checked = 0;
  const report = runSync({
    root: fixture.root,
    argv: ["--tag", "v1.2.10", "--onto-branch", "sync/review"],
    log: quiet,
    check({ root, pendingTag }) {
      checked++;
      assert.equal(pendingTag, "v1.2.10");
      assert.equal(JSON.parse(read(root, versionPath)).version, "1.2.10");
      return { passed: true, results: [] };
    },
  });
  assert.equal(report.exitCode, 0);
  assert.equal(report.status, "ready");
  assert.equal(checked, 1);
  assert.equal(git(fixture.root, ["branch", "--show-current"]), "sync/review");
  assert.equal(read(fixture.root, "fork-feature.txt"), "fork stays\n");
  assert.equal(git(fixture.root, ["tag", "--list", "v1.2.10-*"]), "");
  assert.equal(
    git(fixture.root, ["log", "--format=%s", "v1.2.10..HEAD"]),
    "Keep the fork's teams",
  );
  assert.equal(
    JSON.parse(read(fixture.root, ".tmp/fork-sync-report.json")).status,
    "ready",
  );
  protectedHead(fixture);
});

test("a settings conflict retains cherry-pick state and reports blocks and shared-key guidance", (t) => {
  const fixture = syncFixture(t, { conflict: true });
  const report = runSync({
    root: fixture.root,
    log: quiet,
    check: () => assert.fail("conflict must stop checks"),
  });
  assert.equal(report.exitCode, 1);
  assert.equal(report.status, "conflict");
  assert.equal(report.failedCommit.hash, fixture.featureCommit);
  assert.deepEqual(
    report.conflicts.map(({ path, blocks }) => ({ path, blocks })),
    [{ path: fixture.settings, blocks: 1 }],
  );
  assert.match(report.conflicts[0].hint, /先取上游内容/);
  assert.equal(
    git(fixture.root, ["rev-parse", "CHERRY_PICK_HEAD"]),
    fixture.featureCommit,
  );
  assert.match(read(fixture.root, fixture.settings), /^<<<<<<< /m);
  assert.match(
    read(fixture.root, ".tmp/fork-sync-report.md"),
    /git cherry-pick --continue/,
  );
  protectedHead(fixture);
});

test("failed validation keeps the sync branch and records the failed results", (t) => {
  const fixture = syncFixture(t);
  const report = runSync({
    root: fixture.root,
    log: quiet,
    check: () => ({
      passed: false,
      results: [{ name: "cargo-test", status: 1 }],
    }),
  });
  assert.equal(report.status, "checks-failed");
  assert.equal(report.exitCode, 1);
  assert.equal(report.checks.results[0].status, 1);
  assert.equal(git(fixture.root, ["branch", "--show-current"]), "sync/v1.2.10");
  protectedHead(fixture);
});

test("dirty trees and existing branches fail before switching", (t) => {
  const fixture = syncFixture(t);
  write(fixture.root, "uncommitted.txt", "keep this\n");
  const dirty = runSync({ root: fixture.root, log: quiet });
  assert.equal(dirty.exitCode, 1);
  assert.match(dirty.error, /工作树有未提交改动/);
  assert.equal(read(fixture.root, "uncommitted.txt"), "keep this\n");
  git(fixture.root, ["branch", "sync/existing"]);
  const existing = runSync({
    root: fixture.root,
    argv: ["--onto-branch", "sync/existing"],
    log: quiet,
  });
  assert.match(existing.error, /已存在/);
  assert.equal(git(fixture.root, ["branch", "--show-current"]), sourceBranch);
  protectedHead(fixture);
});

test("a local-only official-looking tag cannot be selected", (t) => {
  const fixture = syncFixture(t);
  const report = runSync({
    root: fixture.root,
    argv: ["--tag", "v99.0.0"],
    log: quiet,
  });
  assert.equal(report.exitCode, 1);
  assert.match(report.error, /upstream 不存在/);
  protectedHead(fixture);
});

test("unknown baselines stop with an explicit confirmation message", (t) => {
  const fixture = syncFixture(t);
  write(fixture.root, versionPath, JSON.stringify({ version: "8.8.8-1" }));
  const report = runSync({ root: fixture.root, log: quiet });
  assert.equal(report.exitCode, 1);
  assert.match(report.error, /基线 v8.8.8.*请确认/);
  assert.equal(
    existsSync(resolve(fixture.root, ".tmp/fork-sync-report.json")),
    true,
  );
  protectedHead(fixture);
});
