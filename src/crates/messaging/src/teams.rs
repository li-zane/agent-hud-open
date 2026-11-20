//! Who has been working with whom through these tools: each pair of sessions
//! where one messaged or started the other, from the journal, for the HUD's
//! sessions list to show as a team. Read only, and never the words.
use super::*;
use serde::Serialize;
use std::collections::HashMap;

/// One side of a link: the session as the snapshot names it, or as the
/// journal last did when the snapshot no longer shows it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Side {
    client: String,
    id: String,
    title: Option<String>,
    project: Option<String>,
}

/// Every message from one session to another that the journal keeps.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Link {
    from: Side,
    to: Side,
    kinds: Vec<Kind>,
    count: u32,
    last_at_ms: i64,
}

fn side(snapshot: &Value, party: &Party) -> Side {
    let session = find_in(snapshot, &party.client, &party.session_id);
    let text = |name: &str| {
        session
            .and_then(|session| session[name].as_str())
            .filter(|text| !text.is_empty())
            .map(str::to_owned)
    };
    Side {
        client: party.client.clone(),
        id: text("id").unwrap_or_else(|| party.session_id.clone()),
        title: text("title").or_else(|| party.title.clone()),
        project: text("project").or_else(|| text("cwd")),
    }
}

/// The links between sessions in `messages` (oldest first), one per sender
/// and recipient, newest first. A refused message makes none, nor a start
/// whose session is not known yet, nor a session writing to itself.
fn links(messages: &[Message], snapshot: &Value) -> Vec<Link> {
    let mut links: Vec<Link> = Vec::new();
    let mut seen: HashMap<(String, String, String, String), usize> = HashMap::new();
    for message in messages {
        if message.state == "refused"
            || message.from.session_id.is_empty()
            || message.to.session_id.is_empty()
            || same_identity(
                (&message.from.client, &message.from.session_id),
                (&message.to.client, &message.to.session_id),
            )
        {
            continue;
        }
        let (from, to) = (side(snapshot, &message.from), side(snapshot, &message.to));
        let key = (
            from.client.clone(),
            from.id.clone(),
            to.client.clone(),
            to.id.clone(),
        );
        match seen.get(&key) {
            Some(&at) => {
                let link = &mut links[at];
                link.count += 1;
                link.last_at_ms = link.last_at_ms.max(message.sent_at_ms);
                if !link.kinds.contains(&message.kind) {
                    link.kinds.push(message.kind);
                }
                // A later message names the sessions as they are now.
                link.from = from;
                link.to = to;
            }
            None => {
                seen.insert(key, links.len());
                links.push(Link {
                    from,
                    to,
                    kinds: vec![message.kind],
                    count: 1,
                    last_at_ms: message.sent_at_ms,
                });
            }
        }
    }
    links.sort_by(|a, b| b.last_at_ms.cmp(&a.last_at_ms));
    links
}

impl Messaging {
    /// Who worked with whom through these tools in the past week, for the
    /// HUD's sessions list: `{links: [{from, to, kinds, count, lastAtMs}]}`,
    /// newest first. Read whether or not the group is on: the journal is the
    /// user's own record, and nothing here sends.
    pub fn collaborations(&self, snapshot: &Value) -> Value {
        json!({ "links": links(self.journal.messages(), snapshot) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(kind: Kind, from: (&str, &str), to: (&str, &str), at: i64, state: &str) -> Message {
        Message {
            id: format!("m{at}"),
            kind,
            chain: "chain".into(),
            count: 1,
            from: Party {
                client: from.0.into(),
                session_id: from.1.into(),
                title: None,
            },
            to: Party {
                client: to.0.into(),
                session_id: to.1.into(),
                title: Some("Journal title".into()),
            },
            form: PromptForm::Labelled,
            reply_to: None,
            request_id: format!("r{at}"),
            sent_at_ms: at,
            cursor: None,
            fingerprint: String::new(),
            state: state.into(),
            reason: None,
            turn: None,
            answered: false,
            replied_by: None,
            steered_into: None,
        }
    }

    #[test]
    fn links_join_each_pair_once_newest_first_named_as_the_snapshot_names_them() {
        let snapshot = json!({"sessions": [
            {"source": "codex", "id": "c1", "title": "Backend", "project": "/p"},
            {"source": "antigravity", "id": "antigravity:a1", "title": "UI", "cwd": "/p"},
            {"source": "claude", "id": "l1", "title": "Lead", "project": "/p"},
        ]});
        let messages = [
            message(
                Kind::Start,
                ("claude", "l1"),
                ("antigravity", "a1"),
                1,
                "done",
            ),
            message(Kind::Send, ("claude", "l1"), ("codex", "c1"), 2, "started"),
            message(
                Kind::Send,
                ("claude", "l1"),
                ("antigravity", "a1"),
                3,
                "done",
            ),
            // Refused, not named yet, and to itself: no link.
            message(Kind::Send, ("claude", "l1"), ("codex", "c2"), 4, "refused"),
            message(Kind::Start, ("claude", "l1"), ("codex", ""), 5, "queued"),
            message(Kind::Send, ("codex", "c1"), ("codex", "c1"), 6, "done"),
        ];
        let found = links(&messages, &snapshot);
        assert_eq!(found.len(), 2);
        // The prefixed id the snapshot shows, its title and folder.
        assert_eq!(found[0].from.title.as_deref(), Some("Lead"));
        assert_eq!(found[0].to.id, "antigravity:a1");
        assert_eq!(found[0].to.title.as_deref(), Some("UI"));
        assert_eq!(found[0].to.project.as_deref(), Some("/p"));
        assert_eq!(found[0].count, 2);
        assert_eq!(found[0].kinds, [Kind::Start, Kind::Send]);
        assert_eq!(found[0].last_at_ms, 3);
        assert_eq!(found[1].to.client, "codex");
        assert_eq!(found[1].last_at_ms, 2);
        let value = serde_json::to_value(&found[0]).unwrap();
        assert_eq!(value["lastAtMs"], 3);
        assert_eq!(value["kinds"], json!(["start", "send"]));
    }

    #[test]
    fn a_session_the_snapshot_no_longer_shows_keeps_the_journals_name() {
        let messages = [message(
            Kind::Start,
            ("claude", "l1"),
            ("antigravity", "a1"),
            1,
            "done",
        )];
        let found = links(&messages, &json!({"sessions": []}));
        assert_eq!(found[0].to.id, "a1");
        assert_eq!(found[0].to.title.as_deref(), Some("Journal title"));
        assert_eq!(found[0].to.project, None);
    }
}
