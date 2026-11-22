#!/usr/bin/env node
// Successful replay says nothing about fork behavior or stale instructions.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const skill = "src/crates/platform/src/hud_tools/agent-team.md";
const command = "src/crates/platform/src/claude_plugin/team-command.md";
const locales = ["de", "es", "fr", "ja", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
// Keep these even if an upstream change removes the UI that uses them.
const translationKeys = [
  "Sessions working together through Agent HUD",
  "Working together",
  "In a team with other sessions",
  "Your teams, in Settings → Agents",
  "Team name",
  "A name you will recognise",
  "Project folder",
  "Any project",
  "Teammates start here, so they read this project's own instructions.",
  "Tasks at once",
  "How many one member holds before the coordinator waits.",
  "Role",
  "What they do",
  "Teammate",
  "A client, and the role it plays.",
  "Teams",
  "Who plays which role when an agent splits work across clients.",
  "Add a team",
  "Change",
  "No teammates yet.",
];

export function mentionedTools(text) {
  const names = new Set();
  for (const match of text.matchAll(
    /\b(?:mcp__[\w-]+__)?[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g,
  )) {
    const at = match.index;
    const name = match[0].split("__").at(-1);
    if (["reply_to", "require_reply"].includes(name)) continue;
    const before = text.slice(Math.max(0, at - 80), at);
    const after = text.slice(at + match[0].length, at + match[0].length + 70);
    // Retirement notices are useful documentation, not instructions to call.
    if (
      /(?:没有|不存在|不再(?:有|提供|使用)?|不要(?:再)?(?:用|使用)?|no(?: longer)?|without|removed|retired|do not use)\s*`?$/i.test(
        before,
      )
    )
      continue;
    if (
      /^`?\s*(?:不存在|已删除|不可用|is (?:unavailable|removed|no longer available))/i.test(
        after,
      )
    )
      continue;
    names.add(name);
  }
  return [...names];
}

export function pendingOptions(argv) {
  if (!argv.length) return {};
  if (
    argv.length !== 2 ||
    argv[0] !== "--pending-tag" ||
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(argv[1])
  ) {
    throw new Error(
      "用法：--pending-tag v<官方版本>（仅在同步后、手工改 fork 版本前使用）",
    );
  }
  return { pendingTag: argv[1] };
}

export function checkFeatures(root = repositoryRoot, { pendingTag } = {}) {
  const results = [];
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const code = (path) =>
    read(path)
      .split(/^\s*#\[cfg\(test\)\]\s*\r?\n\s*mod \w+\s*\{/m)[0]
      .replace(/^\s*\/\/.*$/gm, "");
  const check = (id, why, verify) => {
    try {
      const detail = verify();
      results.push({
        id,
        why,
        passed: detail === true,
        detail: detail === true ? "" : detail,
      });
    } catch (error) {
      results.push({ id, why, passed: false, detail: error.message });
    }
  };
  const contains = (path, pattern) =>
    pattern.test(code(path)) || `${path} 缺少 ${pattern}`;
  check(
    "managed-skill",
    "每个客户端都能安装 Agent HUD 管理的 agent-team 技能",
    () => {
      const managed =
        code("src/crates/platform/src/hud_tools/skill.rs").match(
          /const MANAGED[^=]*=\s*&\[([\s\S]*?)\n\];/,
        )?.[1] ?? "";
      return (
        /folder:\s*"agent-team"\s*,\s*text:\s*include_str!\("agent-team\.md"\)/.test(
          managed,
        ) || "MANAGED 没有注册 agent-team.md"
      );
    },
  );
  check(
    "skill-frontmatter",
    "托管标记让客户端识别并更新技能",
    () =>
      /^\s*managed-by: agent-hud\s*$/m.test(
        read(skill).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "",
      ) || `${skill} frontmatter 缺少 managed-by: agent-hud`,
  );
  check("team-command", "Claude Code 插件提供 /team 入口", () =>
    contains(
      "src/crates/platform/src/claude_plugin/files.rs",
      /fn plugin_files\([\s\S]*?\("commands\/team\.md",\s*COMMAND\.to_string\(\)\)/,
    ),
  );
  check(
    "command-source",
    "/team 命令包含实际协作说明",
    () =>
      (read(command).includes("agent-team") &&
        /const COMMAND[^=]*=\s*include_str!\("team-command\.md"\)/.test(
          code("src/crates/platform/src/claude_plugin/files.rs"),
        )) ||
      "team-command.md 丢失或没有接入插件",
  );
  check("collaborations", "消息层导出 HUD 的协作关系", () =>
    contains("src/crates/messaging/src/teams.rs", /pub fn collaborations\s*\(/),
  );
  check("collaborations-module", "协作模块仍编译进消息层", () =>
    contains("src/crates/messaging/src/lib.rs", /\bmod teams\s*;/),
  );
  check("collaborations-request", "HUD 可以通过 host 查询协作关系", () =>
    contains(
      "src/crates/host/src/requests.rs",
      /(?:method\s*==\s*"collaborations"|"collaborations"\s*=>)/,
    ),
  );
  check("teams-strip", "HUD 会话区渲染协作中的团队", () =>
    contains("src/packages/hud/src/panel/SessionsSection.tsx", /<TeamsStrip\b/),
  );
  check("team-validation", "团队预设接受服务端校验", () =>
    contains(
      "src/crates/core/src/agent_teams.rs",
      /pub(?:\([^)]*\))? fn valid\s*\(/,
    ),
  );
  check("team-default", "默认设置保留 agentTeams，避免保存后重启丢失", () =>
    contains(
      "src/crates/core/src/lib.rs",
      /let mut settings\s*=\s*json!\(\{[^;]*"agentTeams"\s*:\s*\[\]/,
    ),
  );
  check("team-setting", "设置写入时检查团队预设格式", () =>
    contains(
      "src/crates/core/src/settings.rs",
      /fn validate_setting\([\s\S]*?"agentTeams"\s+if\s+crate::agent_teams::valid\(value\)/,
    ),
  );
  check("team-modules", "core 编译团队预设的校验模块", () =>
    contains("src/crates/core/src/lib.rs", /\bmod agent_teams\s*;/),
  );
  check("team-listing", "list_sessions 把团队花名册交给协调者", () =>
    contains("src/crates/messaging/src/listing.rs", /answer\["teams"\]\s*=/),
  );
  check("team-protocol", "前端 AppSettings 声明 agentTeams", () =>
    contains(
      "src/packages/protocol/src/settings.ts",
      /(?:interface|type) AppSettings\b[\s\S]*?agentTeams\??:\s*AgentTeam\[\]/,
    ),
  );
  check(
    "team-settings-ui",
    "消息设置中可以编辑团队预设",
    () =>
      (/export function AgentTeamsRow\b/.test(
        code("src/packages/app/src/settings/agent-plugins/AgentTeamsRow.tsx"),
      ) &&
        /<AgentTeamsRow\b/.test(
          code(
            "src/packages/app/src/settings/agent-plugins/AgentMessagesRow.tsx",
          ),
        )) ||
      "AgentMessagesRow 没有挂载 AgentTeamsRow",
  );
  check("release-hooks", "正式构建接管客户端钩子", () =>
    contains(
      "src/apps/desktop/src-tauri/src/main.rs",
      /HostOptions\s*\{\s*canonical_executable\s*[,}]/,
    ),
  );
  check(
    "fork-release",
    "fork 独立使用 Windows MSVC 发布流程",
    () =>
      read(".github/workflows/fork-release.yml").includes("windows-latest") ||
      "fork-release.yml 丢失 Windows runner",
  );
  for (const locale of locales) {
    check(
      `locale-${locale}`,
      `${locale} 保留协作展示和团队预设的本地化文案`,
      () => {
        const catalog = JSON.parse(
          read(`src/packages/protocol/locales/${locale}.json`),
        );
        const missing = translationKeys.filter(
          (key) => typeof catalog[key] !== "string" || !catalog[key].trim(),
        );
        return missing.length ? `缺少词条：${missing.join("；")}` : true;
      },
    );
  }
  check(
    "fork-version",
    pendingTag
      ? `同步期间 version 应为 ${pendingTag.slice(1)}（待手工加 -1）`
      : "仅 tauri 配置使用 <官方版本>-<计数> 的 fork 版本",
    () => {
      const version = JSON.parse(
        read("src/apps/desktop/src-tauri/tauri.conf.json"),
      ).version;
      return (
        (pendingTag
          ? version === pendingTag.slice(1)
          : /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-[1-9]\d*$/.test(
              version,
            )) ||
        `tauri.conf.json 的 version 应为 ${pendingTag ? pendingTag.slice(1) : "<官方版本>-<计数>"}`
      );
    },
  );
  for (const path of [skill, command]) {
    check(
      `tool-names:${path}`,
      "技能和命令指导调用的工具必须仍在 MCP 工具表中",
      () => {
        const available = new Set(
          [
            ...code("src/crates/messaging/src/tools.rs").matchAll(
              /\{\s*"name"\s*:\s*"([a-z][a-z0-9_]*)"\s*,\s*"readOnly"/g,
            ),
          ].map((match) => match[1]),
        );
        if (!available.size) return "messaging/src/tools.rs 中未找到工具表";
        const mentioned = mentionedTools(read(path));
        const missing = mentioned.filter((name) => !available.has(name));
        return !mentioned.length
          ? `${path} 没有工具调用说明`
          : missing.length
            ? `${path} 引用了已移除工具：${missing.join(", ")}`
            : true;
      },
    );
  }
  return results;
}

export function printFeatures(results, log = console.log) {
  for (const result of results) {
    log(
      `${result.passed ? "PASS" : "FAIL"} ${result.id}: ${result.why}${result.passed ? "" : `\n  ${result.detail}`}`,
    );
  }
  const failed = results.filter((result) => !result.passed).length;
  log(`Fork 功能守卫：${results.length - failed}/${results.length} 通过。`);
  return failed ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = printFeatures(
      checkFeatures(repositoryRoot, pendingOptions(process.argv.slice(2))),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
