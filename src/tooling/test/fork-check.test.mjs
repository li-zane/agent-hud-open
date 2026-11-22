import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checks, runChecks } from "../fork-check.mjs";
import { runCommand } from "../fork-process.mjs";
import { read, temporary } from "./fork-fixture.mjs";

test("native subprocess arguments retain spaces, Unicode and shell characters literally", (t) => {
  const payload = 'two words "quoted"; $(literal) 中文';
  const result = runCommand(
    process.execPath,
    ["-e", "process.stdout.write(process.argv[1])", payload],
    { root: temporary(t) },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, payload);
});

test("all checks run after a command fails or throws, and reports retain exit codes", (t) => {
  const root = temporary(t);
  const invoked = [];
  const output = [];
  const report = runChecks({
    root,
    log: (line) => output.push(line),
    run(command, args) {
      invoked.push(args);
      if (args[0] === "fmt") return { status: 7 };
      if (args[0] === "check") {
        assert.ok(
          existsSync(resolve(root, "src/apps/desktop/src-tauri/resources")),
        );
        throw new Error("compiler missing");
      }
      return { status: 0 };
    },
  });
  assert.equal(invoked.length, checks.length);
  assert.equal(report.passed, false);
  assert.equal(
    report.results.find((result) => result.name === "rustfmt").status,
    7,
  );
  assert.match(output.join("\n"), /compiler missing/);
  assert.match(read(root, ".tmp/fork-check-report.md"), /PASS file-size/);
  assert.deepEqual(
    JSON.parse(read(root, ".tmp/fork-check-report.json")).results.map(
      (result) => result.status,
    ),
    report.results.map((result) => result.status),
  );
});

test("successful checks pass and pending-tag is sent only to feature validation", (t) => {
  const root = temporary(t);
  const invoked = [];
  const report = runChecks({
    root,
    pendingTag: "v1.2.10",
    log() {},
    run(command, args) {
      invoked.push(args);
      return { status: 0 };
    },
  });
  assert.equal(report.passed, true);
  assert.deepEqual(
    invoked.filter((args) => args.includes("--pending-tag")),
    [["src/tooling/fork-features.mjs", "--pending-tag", "v1.2.10"]],
  );
});

test("a killed process with null status is reported as a failure", (t) => {
  const report = runChecks({
    root: temporary(t),
    log() {},
    run: () => ({ status: null }),
  });
  assert.equal(report.passed, false);
  assert.ok(report.results.every((result) => result.status === 1));
});
