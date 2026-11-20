import type { CollaborationLink, CollaborationSide } from "@agent-hud/protocol";

/** Sessions working together through agent messages: each member messaged,
 * started or was messaged by another member within the window. */
export interface Team {
  /** The session that began the work first, then the others as they joined. */
  members: CollaborationSide[];
  /** Messages between members within the window. */
  messages: number;
  lastAtMs: number;
}

const key = (side: CollaborationSide) => `${side.client}\u0000${side.id}`;

/** The teams the links within `windowMs` before `now` make: sessions joined
 * directly or through another member are one team. Newest team first; each
 * member named as the newest link names it. */
export function teamsFrom(
  links: CollaborationLink[],
  now: number,
  windowMs: number,
): Team[] {
  const recent = links.filter((link) => now - link.lastAtMs <= windowMs);
  const parent = new Map<string, string>();
  const root = (at: string) => {
    while (parent.get(at) !== at) at = parent.get(at)!;
    return at;
  };
  const named = new Map<string, CollaborationSide>();
  const order: string[] = [];
  // Oldest first: the session that began the work leads its team, and the
  // newest link names each member last.
  for (const link of [...recent].reverse()) {
    for (const side of [link.from, link.to]) {
      if (!parent.has(key(side))) {
        parent.set(key(side), key(side));
        order.push(key(side));
      }
      named.set(key(side), side);
    }
    const [a, b] = [root(key(link.from)), root(key(link.to))];
    if (a !== b) parent.set(b, a);
  }
  const teams = new Map<string, Team>();
  for (const member of order) {
    const team = teams.get(root(member)) ?? {
      members: [],
      messages: 0,
      lastAtMs: 0,
    };
    team.members.push(named.get(member)!);
    teams.set(root(member), team);
  }
  for (const link of recent) {
    const team = teams.get(root(key(link.from)))!;
    team.messages += link.count;
    team.lastAtMs = Math.max(team.lastAtMs, link.lastAtMs);
  }
  return [...teams.values()].sort((a, b) => b.lastAtMs - a.lastAtMs);
}

/** The index of the team `client`'s session `id` is in, or -1. */
export function teamOf(teams: Team[], client: string, id: string): number {
  const wanted = key({ client, id, title: null, project: null });
  return teams.findIndex((team) =>
    team.members.some((member) => key(member) === wanted),
  );
}
