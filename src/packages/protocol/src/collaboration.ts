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
