/** One side of a collaboration link: the session as the snapshot names it,
 * or as Agent HUD's message journal last did for one it no longer shows. */
export interface CollaborationSide {
  /** The client, as sessions' `source` names it ("claude", "codex", …). */
  client: string;
  id: string;
  title: string | null;
  project: string | null;
}

/** One session messaging or starting another through Agent HUD's agent
 * messages: every such message from one to the other in the past week. */
export interface CollaborationLink {
  from: CollaborationSide;
  to: CollaborationSide;
  kinds: ("send" | "start")[];
  count: number;
  lastAtMs: number;
}

/** The `collaborations` request's answer, newest link first. Read only: who
 * worked with whom, never the words. */
export interface CollaborationsResponse {
  links: CollaborationLink[];
}

/** One member of a team the user saved in Settings → Agents: the client that
 * plays `role`, and the session it is bound to where the user picked one. */
export interface AgentTeamMember {
  /** The client, as sessions' `source` names it ("claude", "codex", …). */
  client: string;
  role: string;
  /** The session this role is bound to; absent leaves the coordinator to find
   * one of that client in the team's folder. */
  session?: string;
}

/** A team the user saved for agent messages: who plays what, in which
 * project, and how many tasks a member holds at once. `list_sessions` hands
 * these to the coordinating agent, which works from them rather than a
 * roster of its own. Unlike a `CollaborationLink`, which Agent HUD reads back
 * from the messages that were sent, this is what the user set up. */
export interface AgentTeam {
  name: string;
  /** The project folder this team is for; absent for any. */
  folder?: string;
  /** Tasks a member holds at once. */
  limit: number;
  members: AgentTeamMember[];
}
