//! The files Claude Code installs as Agent HUD's plugin: its manifest and
//! marketplace, the hooks module that talks to the channel, and the `/team`
//! command that uses the agent-team skill.
use serde_json::json;

const SCRIPT: &str = include_str!("register.ts");
/// The `/team` slash command, which uses the agent-team skill.
const COMMAND: &str = include_str!("team-command.md");

/// Each file's path inside the plugin folder and its text, with the hooks
/// module pointed at `channel`, the channel folder as a JSON string.
pub(super) fn plugin_files(channel: &str) -> [(&'static str, String); 5] {
    [
        (
            ".claude-plugin/marketplace.json",
            json!({"name":"agent-hud","owner":{"name":"Agent HUD"},"plugins":[{"name":"agent-hud","source":"./"}]}).to_string(),
        ),
        (
            ".claude-plugin/plugin.json",
            json!({"name":"agent-hud","version":"1.2.0","description":"Delivers user-authorized Agent HUD input to this existing session, and ships the agent-team workflow.","author":{"name":"Agent HUD"}}).to_string(),
        ),
        ("hooks/hooks.json", json!({"modules":["./register.ts"]}).to_string()),
        ("hooks/register.ts", SCRIPT.replace("__AGENT_HUD_CHANNEL_JSON__", channel)),
        ("commands/team.md", COMMAND.to_string()),
    ]
}
