import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { repositoryRoot } from "../fork-features.mjs";
import { git } from "../fork-process.mjs";
import { versionPath } from "../fork-sync-state.mjs";

// Cherry-pick needs a committer even on a machine with no global Git identity.
process.env.GIT_COMMITTER_NAME = "Fork tests";
process.env.GIT_COMMITTER_EMAIL = "fork-tests@example.invalid";

export function temporary(t) {
  const parent = resolve(repositoryRoot, ".tmp");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(resolve(parent, "fork-tools-test-"));
  t.after(() => {
    if (!resolve(root).startsWith(parent + sep))
      throw new Error("Fixture escaped .tmp");
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

export function write(root, path, content) {
  const destination = resolve(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

export const read = (root, path) => readFileSync(resolve(root, path), "utf8");

export function replace(root, path, before, after) {
  const original = read(root, path);
  if (!original.includes(before))
    throw new Error(`Fixture has no ${before} in ${path}`);
  write(root, path, original.replace(before, after));
}

export function featureFixture(t) {
  const root = temporary(t);
  const paths = [
    "src/crates/platform/src/hud_tools/skill.rs",
    "src/crates/platform/src/hud_tools/agent-team.md",
    "src/crates/platform/src/claude_plugin/files.rs",
    "src/crates/platform/src/claude_plugin/team-command.md",
    "src/crates/messaging/src/teams.rs",
    "src/crates/messaging/src/lib.rs",
    "src/crates/messaging/src/tools.rs",
    "src/crates/messaging/src/listing.rs",
    "src/crates/host/src/requests.rs",
    "src/crates/core/src/agent_teams.rs",
    "src/crates/core/src/lib.rs",
    "src/crates/core/src/settings.rs",
    "src/packages/protocol/src/settings.ts",
    "src/packages/hud/src/panel/SessionsSection.tsx",
    "src/packages/app/src/settings/agent-plugins/AgentTeamsRow.tsx",
    "src/packages/app/src/settings/agent-plugins/AgentMessagesRow.tsx",
    "src/apps/desktop/src-tauri/src/main.rs",
    ".github/workflows/fork-release.yml",
    ...["de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hans", "zh-Hant"].map(
      (locale) => `src/packages/protocol/locales/${locale}.json`,
    ),
  ];
  for (const path of paths) write(root, path, read(repositoryRoot, path));
  // Tests of other features must also run before a sync's manual version bump.
  write(root, versionPath, JSON.stringify({ version: "1.2.3-1" }));
  return root;
}

export function commit(root, subject) {
  git(root, ["add", "."]);
  git(root, [
    "-c",
    "user.name=Fork tests",
    "-c",
    "user.email=fork-tests@example.invalid",
    "commit",
    "-m",
    subject,
  ]);
  return git(root, ["rev-parse", "HEAD"]);
}

export function syncFixture(t, { newer = true, conflict = false } = {}) {
  const parent = temporary(t);
  const upstream = resolve(parent, "upstream");
  const root = resolve(parent, "fork");
  mkdirSync(upstream);
  git(upstream, ["init", "-b", "main"]);
  write(upstream, ".gitattributes", "* text=auto eol=lf\n");
  write(upstream, ".gitignore", ".tmp/\n");
  write(upstream, versionPath, JSON.stringify({ version: "1.2.3" }));
  const settings = "src/crates/core/src/lib.rs";
  write(upstream, settings, 'let settings = json!({"base":true});\n');
  commit(upstream, "Upstream base");
  git(upstream, ["tag", "v1.2.3"]);
  git(parent, ["clone", upstream, root]);
  git(root, ["remote", "rename", "origin", "upstream"]);
  git(root, ["switch", "-c", "feature/agent-team"]);
  write(
    root,
    conflict ? settings : "fork-feature.txt",
    conflict
      ? 'let settings = json!({"base":true,"agentTeams":[]});\n'
      : "fork stays\n",
  );
  const featureCommit = commit(root, "Keep the fork's teams");
  write(root, versionPath, JSON.stringify({ version: "1.2.3-1" }));
  commit(root, "Version this fork 1.2.3-1");
  const sourceHead = git(root, ["rev-parse", "HEAD"]);
  // A local stable tag is not proof of an official upstream release.
  git(root, ["tag", "v99.0.0"]);
  git(root, ["tag", "v1.2.3-99"]);
  if (newer) {
    write(upstream, versionPath, JSON.stringify({ version: "1.2.10" }));
    if (conflict)
      write(
        upstream,
        settings,
        'let settings = json!({"base":true,"agentMessagesRequireReply":true});\n',
      );
    commit(upstream, "Upstream next release");
    git(upstream, [
      "-c",
      "user.name=Fork tests",
      "-c",
      "user.email=fork-tests@example.invalid",
      "tag",
      "-a",
      "v1.2.10",
      "-m",
      "Official annotated release",
    ]);
    git(upstream, ["tag", "v99.0.0-beta.1"]);
  }
  return { root, upstream, sourceHead, featureCommit, settings };
}
