//! The teams the user saves for agent messages (`agentTeams` in the app's
//! settings, Settings → Agents): each a name of its own, the project folder
//! it is for, how many tasks a member holds at once, and its members — a
//! client, the role it plays, and the session it is bound to. Agent HUD
//! hands them to the coordinating agent in `list_sessions`; the messaging
//! side reads them, this side only says whether the settings may hold them.
use serde_json::Value;

/// Teams the settings hold, and members one team holds.
const MOST_TEAMS: usize = 20;
const MOST_MEMBERS: usize = 12;
/// Tasks one member may be given at once.
const HELD: std::ops::RangeInclusive<u64> = 1..=10;

/// A text a team or a member may leave out: absent or null, or a string
/// within `max` bytes that no stray NUL runs through.
fn text(value: &Value, key: &str, max: usize) -> bool {
    match value.get(key) {
        None | Some(Value::Null) => true,
        Some(Value::String(text)) => text.len() <= max && !text.contains('\0'),
        Some(_) => false,
    }
}

/// One member: a client this copy knows, the role it plays, and the session
/// the user bound it to where they picked one.
fn member(member: &Value) -> bool {
    member["client"]
        .as_str()
        .is_some_and(|client| agent_hud_agents::split::agent_of(client).is_some())
        && text(member, "role", 60)
        && text(member, "session", 200)
}

/// One team, among the ones before it: a name of its own that no other team
/// in the list already carries.
fn team(team: &Value, before: &[Value]) -> bool {
    let name = team["name"].as_str().unwrap_or_default();
    !name.is_empty()
        && name.trim() == name
        && name.len() <= 80
        && !before.iter().any(|other| other["name"] == team["name"])
        && text(team, "folder", 500)
        && team["limit"]
            .as_u64()
            .is_some_and(|held| HELD.contains(&held))
        && team["members"]
            .as_array()
            .is_some_and(|members| members.len() <= MOST_MEMBERS && members.iter().all(member))
}

/// Whether `agentTeams` may be saved as it stands.
pub(crate) fn valid(value: &Value) -> bool {
    value.as_array().is_some_and(|teams| {
        teams.len() <= MOST_TEAMS
            && teams
                .iter()
                .enumerate()
                .all(|(index, each)| team(each, &teams[..index]))
    })
}
