// Sessions that message or start each other through Agent HUD show as one
// team in the sessions list, for as long as the list's window reaches back.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CollaborationLink, CollaborationSide } from "@agent-hud/protocol";
import { teamOf, teamsFrom } from "../src/panel/teams.ts";

const side = (client: string, id: string, title = id): CollaborationSide => ({
  client,
  id,
  title,
  project: "/p",
});
const link = (
  from: CollaborationSide,
  to: CollaborationSide,
  lastAtMs: number,
  count = 1,
): CollaborationLink => ({ from, to, kinds: ["send"], count, lastAtMs });

const HOUR = 3_600_000;
const lead = side("claude", "l1", "Lead");
const ui = side("antigravity", "antigravity:a1", "UI");
const backend = side("codex", "c1", "Backend");
const other = side("codex", "c2");
const helper = side("deepseek", "d1");

test("sessions joined directly or through a member are one team, the lead first", () => {
  // Newest first, as the host answers.
  const links = [
    link(ui, lead, 5 * HOUR, 2),
    link(lead, backend, 4 * HOUR),
    link(lead, ui, 3 * HOUR),
    link(other, helper, 2 * HOUR),
  ];
  const teams = teamsFrom(links, 6 * HOUR, 24 * HOUR);
  assert.equal(teams.length, 2);
  assert.deepEqual(
    teams[0].members.map((member) => member.title),
    ["Lead", "UI", "Backend"],
  );
  assert.equal(teams[0].messages, 4);
  assert.equal(teams[0].lastAtMs, 5 * HOUR);
  assert.deepEqual(
    teams[1].members.map((member) => member.id),
    ["c2", "d1"],
  );
  assert.equal(teamOf(teams, "antigravity", "antigravity:a1"), 0);
  assert.equal(teamOf(teams, "deepseek", "d1"), 1);
  assert.equal(teamOf(teams, "codex", "nobody"), -1);
});

test("links older than the window make no team", () => {
  // At 31 h, the link at 30 h is an hour old, the one at 2 h 29 hours old.
  const links = [link(lead, ui, 30 * HOUR), link(lead, backend, 2 * HOUR)];
  const day = teamsFrom(links, 31 * HOUR, 24 * HOUR);
  assert.equal(day.length, 1);
  assert.deepEqual(
    day[0].members.map((member) => member.id),
    ["l1", "antigravity:a1"],
  );
  assert.equal(teamsFrom(links, 31 * HOUR, 7 * 24 * HOUR)[0].members.length, 3);
  assert.deepEqual(teamsFrom([], 0, HOUR), []);
});

test("each member is named as the newest link names it", () => {
  const renamed = side("antigravity", "antigravity:a1", "UI polish");
  const teams = teamsFrom(
    [link(lead, renamed, 2 * HOUR), link(lead, ui, HOUR)],
    3 * HOUR,
    24 * HOUR,
  );
  assert.deepEqual(
    teams[0].members.map((member) => member.title),
    ["Lead", "UI polish"],
  );
});
