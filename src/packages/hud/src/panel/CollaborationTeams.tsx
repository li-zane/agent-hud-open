import type { CSSProperties } from "react";
import type { CollaborationsResponse, Snapshot } from "@agent-hud/protocol";
import { useT } from "@agent-hud/ui/format-context";
import { usePanelQuery, usePanelServices } from "../PanelContext";
import { teamOf, teamsFrom, type Team } from "./teams";
import { noButtonChrome, type Logo, type palette } from "./theme";

const DAY_MS = 86_400_000;
/** At most this many teams take room above the sessions. */
const SHOWN = 3;

const clipped: CSSProperties = {
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/** The teams of sessions working together through agent messages within the
 * sessions list's window (24 hours, or 7 days), and which team a row is in.
 * Without an answer (agent messages unavailable) there are none. */
export function useTeams(snapshot: Snapshot, week: boolean, active: boolean) {
  const query = usePanelQuery<CollaborationsResponse>(
    "collaborations",
    {},
    snapshot.sessionsRevision,
    active,
  );
  const now = Date.parse(snapshot.generatedAt) || Date.now();
  const teams = teamsFrom(
    query.data?.links ?? [],
    now,
    week ? 7 * DAY_MS : DAY_MS,
  );
  return {
    teams,
    teamOf: (client: string, id: string) => teamOf(teams, client, id),
  };
}

/** A line per team above the sessions: its members' marks and names, the
 * session that began the work first. */
export function TeamsStrip({
  teams,
  light,
  Logo,
  colors,
}: {
  teams: Team[];
  light: boolean;
  Logo: Logo;
  colors: ReturnType<typeof palette>;
}) {
  const t = useT();
  if (!teams.length) return null;
  return (
    <div
      className="hud-session-teams"
      title={t("Sessions working together through Agent HUD")}
      style={{ display: "grid", gap: 4 }}
    >
      {teams.slice(0, SHOWN).map((team) => (
        <div
          key={team.members.map((m) => `${m.client}:${m.id}`).join("|")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            lineHeight: "15px",
            color: colors.secondary,
          }}
        >
          <span style={{ flexShrink: 0, fontWeight: 600, color: colors.text }}>
            {t("Working together")}
          </span>
          {team.members.map((member, index) => (
            <span
              key={`${member.client}:${member.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                minWidth: 0,
                // The first members keep their names longest.
                flexShrink: index + 1,
              }}
            >
              {index > 0 && <span style={{ flexShrink: 0 }}>↔</span>}
              <span style={{ display: "block", flex: "0 0 12px", height: 12 }}>
                <Logo source={member.client} size={12} light={light} />
              </span>
              <span style={clipped}>{member.title || member.client}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The teams the user saved in Settings → Agents, above the ones Agent HUD
 * read back from the messages: a line per team with its members' marks and
 * roles. A click opens the page that edits them. Nothing while none is
 * saved, or while agent messages are off and nothing reads them. */
export function TeamPresetLine({
  snapshot,
  light,
  Logo,
  colors,
}: {
  snapshot: Snapshot;
  light: boolean;
  Logo: Logo;
  colors: ReturnType<typeof palette>;
}) {
  const t = useT();
  const services = usePanelServices();
  const teams =
    snapshot.settings.agentMessages === true
      ? (snapshot.settings.agentTeams ?? [])
      : [];
  if (!teams.length) return null;
  const open = services?.openSettingsPage;
  return (
    <div
      className="hud-session-team-presets"
      style={{ display: "grid", gap: 4 }}
    >
      {teams.slice(0, SHOWN).map((team) => (
        <button
          key={team.name}
          type="button"
          disabled={!open}
          title={t("Your teams, in Settings → Agents")}
          onClick={() => open?.("agents")}
          style={{
            ...noButtonChrome,
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            minWidth: 0,
            lineHeight: "15px",
            cursor: open ? "pointer" : "default",
            color: colors.secondary,
          }}
        >
          <span style={{ flexShrink: 0, fontWeight: 600, color: colors.text }}>
            {team.name}
          </span>
          {team.members.map((member, index) => (
            <span
              key={`${member.client}:${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                minWidth: 0,
                // The first members keep their roles longest.
                flexShrink: index + 1,
              }}
            >
              <span style={{ display: "block", flex: "0 0 12px", height: 12 }}>
                <Logo source={member.client} size={12} light={light} />
              </span>
              {member.role && <span style={clipped}>{member.role}</span>}
            </span>
          ))}
        </button>
      ))}
    </div>
  );
}

/** Marks a session row that is in a team. */
export function TeamMark({ color }: { color: string }) {
  const t = useT();
  return (
    <span
      title={t("In a team with other sessions")}
      style={{ flexShrink: 0, fontSize: 11, color }}
    >
      ⇄
    </span>
  );
}
