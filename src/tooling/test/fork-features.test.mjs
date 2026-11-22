import assert from "node:assert/strict";
import { test } from "node:test";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  checkFeatures,
  mentionedTools,
  pendingOptions,
  printFeatures,
  repositoryRoot,
} from "../fork-features.mjs";
import { runCommand } from "../fork-process.mjs";
import { featureFixture, read, replace, write } from "./fork-fixture.mjs";
import { versionPath } from "../fork-sync-state.mjs";

const failures = (root, options) =>
  checkFeatures(root, options).filter((result) => !result.passed);
const skill = "src/crates/platform/src/hud_tools/agent-team.md";
const command = "src/crates/platform/src/claude_plugin/team-command.md";

test("the fork's current features pass all guards", (t) => {
  assert.deepEqual(failures(featureFixture(t)), []);
});

test("removing the default fails by feature name, and restoring bytes passes", (t) => {
  const root = featureFixture(t);
  const path = "src/crates/core/src/lib.rs";
  const before = read(root, path);
  replace(root, path, '"agentTeams":[],', "");
  const failed = failures(root);
  assert.deepEqual(
    failed.map((result) => result.id),
    ["team-default"],
  );
  const output = [];
  assert.equal(
    printFeatures(checkFeatures(root), (line) => output.push(line)),
    1,
  );
  assert.match(
    output.join("\n"),
    /FAIL team-default:.*默认设置保留 agentTeams/,
  );
  write(root, path, before);
  assert.equal(read(root, path), before);
  assert.equal(
    printFeatures(checkFeatures(root), () => {}),
    0,
  );
});

test("CLI baseline exits 0, damaged copy exits 1, and rollback on another copy restores the hash", (t) => {
  const root = featureFixture(t);
  const path = "src/crates/core/src/lib.rs";
  const original = read(root, path);
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  const script = "src/tooling/fork-features.mjs";
  const run = (directory) => {
    write(directory, script, read(repositoryRoot, script));
    return runCommand(process.execPath, [resolve(directory, script)], {
      root: directory,
    });
  };
  const baseline = run(root);
  assert.equal(baseline.status, 0);
  assert.match(baseline.stdout, /28\/28 通过/);
  replace(root, path, '"agentTeams":[],', "");
  const modified = run(root);
  assert.equal(modified.status, 1);
  assert.match(modified.stdout, /FAIL team-default:.*agentTeams/);
  assert.match(modified.stdout, /27\/28 通过/);
  const rollback = featureFixture(t);
  write(rollback, path, read(root, path));
  assert.notEqual(hash(read(rollback, path)), hash(original));
  write(rollback, path, original);
  const restored = run(rollback);
  assert.equal(restored.status, 0);
  assert.match(restored.stdout, /28\/28 通过/);
  assert.equal(hash(read(rollback, path)), hash(original));
  assert.equal(hash(read(repositoryRoot, path)), hash(original));
  t.diagnostic(
    "BASELINE exit 0: 28/28 通过；MODIFIED exit 1: FAIL team-default, 27/28 通过；ROLLBACK exit 0: 28/28 通过，SHA256 已还原。",
  );
});

for (const path of [skill, command]) {
  test(`positive obsolete tool references fail in ${path}`, (t) => {
    const root = featureFixture(t);
    write(
      root,
      path,
      `${read(root, path)}\nCall get_message({}) and \`archive_session\` to collect results.\n`,
    );
    const failed = failures(root);
    assert.equal(failed.length, 1);
    assert.match(failed[0].detail, /get_message, archive_session/);
  });
}

test("retirement notices and argument fields are not calls", () => {
  assert.deepEqual(
    mentionedTools(
      "没有 `get_message` 可查。there is no `poll_messages` to call. `reply_to` / `require_reply`. Call `mcp__agent-hud__send_message` instead.",
    ),
    ["send_message"],
  );
});

test("removing an advertised tool from the table fails both documents", (t) => {
  const root = featureFixture(t);
  replace(
    root,
    "src/crates/messaging/src/tools.rs",
    '"name":"list_sessions"',
    '"name":"retired_sessions"',
  );
  assert.deepEqual(
    failures(root).map((result) => result.id),
    [`tool-names:${skill}`, `tool-names:${command}`],
  );
});

test("a missing locale key reports the locale and original English key", (t) => {
  const root = featureFixture(t);
  const path = "src/packages/protocol/locales/zh-Hans.json";
  const catalog = JSON.parse(read(root, path));
  delete catalog["Working together"];
  write(root, path, JSON.stringify(catalog));
  const failed = failures(root);
  assert.equal(failed[0].id, "locale-zh-Hans");
  assert.match(failed[0].detail, /Working together/);
});

test("missing sources and disconnected plugin commands are failures", (t) => {
  const root = featureFixture(t);
  rmSync(resolve(root, "src/crates/core/src/agent_teams.rs"));
  replace(
    root,
    "src/crates/platform/src/claude_plugin/files.rs",
    '"commands/team.md"',
    '"commands/removed.md"',
  );
  assert.deepEqual(
    failures(root).map((result) => result.id),
    ["team-command", "team-validation"],
  );
});

test("pending versions accept only the explicit target; normal checks require a fork suffix", (t) => {
  const root = featureFixture(t);
  for (const version of ["1.2.3", "1.2.3-0", "1.2.3-beta.1", "v1.2.3-1"]) {
    write(root, versionPath, JSON.stringify({ version }));
    assert.deepEqual(
      failures(root).map((result) => result.id),
      ["fork-version"],
    );
  }
  write(root, versionPath, JSON.stringify({ version: "1.2.3" }));
  assert.deepEqual(failures(root, { pendingTag: "v1.2.3" }), []);
  assert.equal(failures(root, { pendingTag: "v1.2.4" })[0].id, "fork-version");
  assert.deepEqual(pendingOptions(["--pending-tag", "v1.2.3"]), {
    pendingTag: "v1.2.3",
  });
  assert.throws(() => pendingOptions(["--pending-tag", "v1.2.3-1"]));
});
