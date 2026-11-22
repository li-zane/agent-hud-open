//! The user's choices for agent messages, as the app's settings hold them.
use serde::Serialize;
use serde_json::Value;

/// Passes in a row before the user is asked to look, unless they chose another.
pub const DEFAULT_LIMIT: u32 = 10;

/// Tasks a member holds at once when the team says nothing.
const DEFAULT_HELD: u32 = 1;

/// One member of a saved team: the client that plays `role`, and the session
/// it is bound to where the user picked one.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct TeamMember {
    pub client: String,
    pub role: String,
    /// The session this role is bound to; None leaves the coordinator to find
    /// one of that client in the team's folder.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
}

/// A team the user saved in Settings → Agents: who plays what, in which
/// project, and how many tasks a member holds at once.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Team {
    pub name: String,
    /// The project folder this team is for; None for any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    pub limit: u32,
    pub members: Vec<TeamMember>,
}

/// A text the settings may leave out or leave empty.
fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

/// The saved teams (`agentTeams`). One without a name, or a member without a
/// client, is left out: the settings are written by the app, but an older or
/// hand-edited file need not hold what this version expects.
fn teams(settings: &Value) -> Vec<Team> {
    settings["agentTeams"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|team| {
            Some(Team {
                name: text(&team["name"])?,
                folder: text(&team["folder"]),
                limit: team["limit"]
                    .as_u64()
                    .map_or(DEFAULT_HELD, |held| held.clamp(1, 10) as u32),
                members: team["members"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|member| {
                        Some(TeamMember {
                            client: text(&member["client"])?,
                            role: member["role"].as_str().unwrap_or_default().to_owned(),
                            session: text(&member["session"]),
                        })
                    })
                    .collect(),
            })
        })
        .collect()
}

/// Settings → Agents. Among the agent tools: "Let agents message each
/// other" (`agentMessages`), "Send as me" (`agentMessagesAsUser`), "Ask for
/// replies only when needed" (`agentMessagesRequireReply`) and how many
/// passes in a row before the user looks (`agentMessagesLimit`, null for no
/// limit). Under the same switch, the teams the user saved (`agentTeams`).
/// On the Claude Code and DeepSeek Harness plugins' rows: "Send
/// messages" (`claudeMessages`, `deepseekMessages`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Preferences {
    pub enabled: bool,
    /// The words go in as the user's own, with no label and no reply line.
    pub as_user: bool,
    /// The sender says of each message whether it needs a reply
    /// (`require_reply`): one that does carries the label and the reply line,
    /// under "Send as me" too; one that does not carries no reply line. On
    /// unless turned off; off, every labelled message asks for a reply.
    pub require_reply: bool,
    /// Passes in a row with no word from the user; None is no limit.
    pub limit: Option<u32>,
    /// Messages may go into Claude Code sessions.
    pub claude: bool,
    /// Messages may go into DeepSeek Harness sessions.
    pub deepseek: bool,
    /// The teams saved in Settings → Agents, for `list_sessions` to hand the
    /// coordinator; empty until the user saves one.
    pub teams: Vec<Team>,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            enabled: false,
            as_user: false,
            require_reply: true,
            limit: Some(DEFAULT_LIMIT),
            claude: true,
            deepseek: true,
            teams: Vec::new(),
        }
    }
}
impl Preferences {
    /// The choices in the app's `settings`; a setting not there yet is its default.
    pub fn read(settings: &Value) -> Self {
        let limit = match settings.get("agentMessagesLimit") {
            None => Some(DEFAULT_LIMIT),
            Some(Value::Null) => None,
            Some(limit) => limit
                .as_u64()
                .and_then(|limit| u32::try_from(limit).ok())
                .filter(|limit| *limit > 0)
                .or(Some(DEFAULT_LIMIT)),
        };
        Self {
            enabled: settings["agentMessages"] == true,
            as_user: settings["agentMessagesAsUser"] == true,
            require_reply: settings["agentMessagesRequireReply"] != false,
            limit,
            claude: settings["claudeMessages"] != false,
            deepseek: settings["deepseekMessages"] != false,
            teams: teams(settings),
        }
    }
}
