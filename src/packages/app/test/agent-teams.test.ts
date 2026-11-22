// The team editor in Settings → Agents: who may be a teammate, how a
// member's client and bound session make one menu value, and what a
// filled-in form saves.
import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  AgentTeamMember,
  ClientRow,
  Session,
  Snapshot,
} from "@agent-hud/protocol";
import {
  memberOf,
  memberPlaces,
  memberValue,
  roster,
  talkingClients,
  teamFrom,
  teamReady,
  SEPARATOR,
  TALKS,
} from "../src/settings/agent-plugins/teams.ts";

const client = (
  id: string,
  agent: string,
  name: string,
  talks = true,
): ClientRow => ({
  id,
  agent,
  name,
  group: agent,
  groupName: name,
  detected: true,
  enabled: true,
  features: talks ? ["talk"] : ["live"],
});

const session = (id: string, source: string, cwd: string, title: string) =>
  ({ id, source, cwd, title, model: "", updatedAt: "" }) as Session;

const snapshot = (over: Partial<Snapshot>) => over as Snapshot;

const member = (
  over: Partial<AgentTeamMember> & { client: string },
): AgentTeamMember => ({ role: "", ...over });

test("teammates are the clients that take messages, each agent once", () => {
  const clients = talkingClients(
    snapshot({
      clients: [
        client("claude-code", "claude", "Claude Code"),
        client("claude-desktop", "claude", "Claude Desktop"),
        client("codex", "codex", "Codex"),
        client("cursor", "cursor", "Cursor", false),
      ],
    }),
  );
  assert.deepEqual(clients, [
    ["claude", "Claude Code"],
    ["codex", "Codex"],
  ]);
});

test("with no clients in the snapshot the four that start sessions stand in", () => {
  assert.deepEqual(
    talkingClients(snapshot({})).map(([id]) => id),
    TALKS,
  );
  assert.deepEqual(
    talkingClients(snapshot({ clients: [] })).map(([id]) => id),
    TALKS,
  );
});

test("a member's menu offers its client's sessions in the team's folder", () => {
  const clients = talkingClients(snapshot({}));
  const sessions = [
    session("c1", "codex", "/work/checkout", "Review"),
    session("c2", "codex", "/work/billing", "Elsewhere"),
    session("c3", "codex", "/work/checkout", ""),
    session("a1", "antigravity", "/work/checkout", "UI"),
  ];
  const places = memberPlaces(
    clients,
    sessions,
    "/work/checkout",
    member({ client: "codex" }),
    "(untitled session)",
  );
  assert.deepEqual(places.slice(TALKS.length), [
    [`codex${SEPARATOR}c1`, "codex · Review"],
    [`codex${SEPARATOR}c3`, "codex · (untitled session)"],
  ]);
  // Without a folder the team takes that client's sessions anywhere.
  const anywhere = memberPlaces(
    clients,
    sessions,
    "   ",
    member({ client: "codex" }),
    "(untitled session)",
  );
  assert.equal(anywhere.length, TALKS.length + 3);
});

test("a bound session the snapshot no longer shows keeps its place", () => {
  const clients = talkingClients(snapshot({}));
  const places = memberPlaces(
    clients,
    [],
    "",
    member({ client: "codex", session: "gone" }),
    "(untitled session)",
  );
  assert.deepEqual(places.at(-1), [`codex${SEPARATOR}gone`, "codex · gone"]);
  // One the snapshot still shows is offered once, not twice.
  const kept = memberPlaces(
    clients,
    [session("c1", "codex", "/p", "Review")],
    "",
    member({ client: "codex", session: "c1" }),
    "(untitled session)",
  );
  assert.equal(
    kept.filter(([value]) => value === `codex${SEPARATOR}c1`).length,
    1,
  );
});

test("a menu value carries the client, and the session only when bound", () => {
  assert.equal(memberValue(member({ client: "codex" })), "codex");
  assert.equal(
    memberValue(member({ client: "codex", session: "c1" })),
    `codex${SEPARATOR}c1`,
  );
  assert.deepEqual(memberOf("codex", "Backend"), {
    client: "codex",
    role: "Backend",
  });
  assert.deepEqual(memberOf(`codex${SEPARATOR}c1`, "Backend"), {
    client: "codex",
    role: "Backend",
    session: "c1",
  });
});

test("a saved team is trimmed, and keeps no folder when it is for any project", () => {
  assert.deepEqual(
    teamFrom({
      name: "  Checkout  ",
      folder: "  ",
      limit: 2,
      members: [
        member({ client: "codex", role: "  Backend  " }),
        member({ client: "", role: "Nobody" }),
        member({ client: "claude", role: "Lead", session: "l1" }),
      ],
    }),
    {
      name: "Checkout",
      limit: 2,
      members: [
        { client: "codex", role: "Backend" },
        { client: "claude", role: "Lead", session: "l1" },
      ],
    },
  );
  assert.equal(
    teamFrom({ name: "A", folder: " /work ", limit: 1, members: [] }).folder,
    "/work",
  );
});

test("a team saves once it has a name and someone to play a role", () => {
  assert.equal(teamReady("  ", [member({ client: "codex" })]), false);
  assert.equal(teamReady("Checkout", []), false);
  assert.equal(teamReady("Checkout", [member({ client: "" })]), false);
  assert.equal(teamReady("Checkout", [member({ client: "codex" })]), true);
});

test("a team reads as one line of roles and clients", () => {
  const clients = talkingClients(
    snapshot({ clients: [client("codex", "codex", "Codex")] }),
  );
  assert.equal(
    roster(
      {
        name: "Checkout",
        limit: 1,
        members: [
          member({ client: "codex", role: "Backend" }),
          member({ client: "claude" }),
        ],
      },
      clients,
    ),
    "Backend · Codex，claude",
  );
});
