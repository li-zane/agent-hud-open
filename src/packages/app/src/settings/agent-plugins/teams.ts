// The pure part of the team editor in Settings → Agents: which clients may be
// teammates, how a member's client and the session it is bound to make one
// menu value, and the team a filled-in form hands back. The rows themselves
// are AgentTeamsRow.tsx.
import type {
  AgentTeam,
  AgentTeamMember,
  Session,
  Snapshot,
} from "@agent-hud/protocol";

/** Clients a team falls back to when the snapshot lists none that talk. */
export const TALKS = ["claude", "codex", "antigravity", "deepseek"];
/** A member's client and bound session in one menu value. */
export const SEPARATOR = "\u0000";
/** Teams and members a team may hold, as the app's settings allow. */
export const MOST_TEAMS = 20;
export const MOST_MEMBERS = 12;

/** A menu option: the value saved, and what the menu shows. */
export type Choice = [string, string];

/** The clients that take agent messages, each once, named as the snapshot
 * names them; the four `start_session` opens when the snapshot lists none. */
export function talkingClients(snapshot: Snapshot): Choice[] {
  const clients = new Map<string, string>();
  for (const row of snapshot.clients ?? [])
    if (row.features?.includes("talk") && !clients.has(row.agent))
      clients.set(row.agent, row.name);
  if (!clients.size) for (const client of TALKS) clients.set(client, client);
  return [...clients];
}

/** A client's name, or its id where this copy knows no name for it. */
export function clientName(clients: Choice[], client: string): string {
  return clients.find(([id]) => id === client)?.[1] ?? client;
}

/** A team's members as one line: each one's role and client. */
export function roster(team: AgentTeam, clients: Choice[]): string {
  return team.members
    .map((member) =>
      member.role
        ? `${member.role} · ${clientName(clients, member.client)}`
        : clientName(clients, member.client),
    )
    .join("，");
}

/** The menu value a member stands at: its client, or the session it is
 * bound to. */
export function memberValue(member: AgentTeamMember): string {
  return member.session
    ? `${member.client}${SEPARATOR}${member.session}`
    : member.client;
}

/** The member a menu value makes, keeping the role it already had. */
export function memberOf(value: string, role: string): AgentTeamMember {
  const [client, session] = value.split(SEPARATOR);
  return session ? { client, role, session } : { client, role };
}

/** What one member's menu offers: every client that talks, then that
 * client's sessions in the team's folder (every folder while it is empty).
 * A session the user bound that the snapshot no longer shows keeps its
 * place, so opening the form does not quietly drop it. */
export function memberPlaces(
  clients: Choice[],
  sessions: Session[],
  folder: string,
  member: AgentTeamMember,
  untitled: string,
): Choice[] {
  const within = folder.trim();
  const own = sessions
    .filter(
      (session) =>
        session.source === member.client && (!within || session.cwd === within),
    )
    .map((session): Choice => [
      `${member.client}${SEPARATOR}${session.id}`,
      `${clientName(clients, member.client)} · ${session.title || untitled}`,
    ]);
  const bound = memberValue(member);
  const lost =
    member.session && !own.some(([value]) => value === bound)
      ? [
          [
            bound,
            `${clientName(clients, member.client)} · ${member.session}`,
          ] as Choice,
        ]
      : [];
  return [...clients, ...own, ...lost];
}

/** The team a filled-in form saves: trimmed, without the folder when it is
 * for any project, and without the members left unchosen. */
export function teamFrom(draft: {
  name: string;
  folder: string;
  limit: number;
  members: AgentTeamMember[];
}): AgentTeam {
  const folder = draft.folder.trim();
  return {
    name: draft.name.trim(),
    ...(folder ? { folder } : {}),
    limit: draft.limit,
    members: draft.members
      .filter((member) => member.client)
      .map((member) => ({
        client: member.client,
        role: member.role.trim(),
        ...(member.session ? { session: member.session } : {}),
      })),
  };
}

/** Whether a form holds enough to save: a name, and someone to play a role. */
export function teamReady(name: string, members: AgentTeamMember[]): boolean {
  return Boolean(name.trim()) && members.some((member) => member.client);
}
