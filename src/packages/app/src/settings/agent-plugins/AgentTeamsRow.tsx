// The teams under "Let agents message each other": who plays which role when
// one agent splits work across clients. Agent HUD hands them to the
// coordinating agent in `list_sessions`, so it works from the user's roster
// instead of one of its own. A team names a project folder, so teammates are
// started where they read that project's own instructions, and how many
// tasks a member holds at once. The pure parts are in teams.ts.
import { useState } from "react";
import { toast } from "sonner";
import type { AgentTeam, AgentTeamMember, Snapshot } from "@agent-hud/protocol";
import type { Translate } from "@agent-hud/ui/format";
import { LinkButton, Menu, SmallButton } from "../SettingsControls";
import {
  FieldRow,
  FormActions,
  InlineForm,
  TextInput,
} from "../SettingsFields";
import { Row, type SettingsPaneProps } from "../SettingsPrimitives";
import {
  memberOf,
  memberPlaces,
  memberValue,
  roster,
  talkingClients,
  teamFrom,
  teamReady,
  MOST_MEMBERS,
  MOST_TEAMS,
  TALKS,
} from "./teams";

/** Tasks a member may hold at once; the skill's roster says one. */
const HELD = [1, 2, 3, 4, 5];

function TeamForm({
  team,
  snapshot,
  pending,
  onSave,
  onCancel,
  t,
}: {
  team: AgentTeam;
  snapshot: Snapshot;
  pending: boolean;
  onSave: (team: AgentTeam) => void;
  onCancel: () => void;
  t: Translate;
}) {
  const [name, setName] = useState(team.name);
  const [folder, setFolder] = useState(team.folder ?? "");
  const [limit, setLimit] = useState(team.limit);
  const [members, setMembers] = useState<AgentTeamMember[]>(team.members);
  const clients = talkingClients(snapshot);
  const change = (index: number, member: AgentTeamMember) =>
    setMembers(members.map((each, at) => (at === index ? member : each)));
  return (
    <InlineForm
      onSubmit={() => onSave(teamFrom({ name, folder, limit, members }))}
    >
      <FieldRow
        label={t("Team name")}
        value={name}
        change={setName}
        placeholder={t("A name you will recognise")}
        disabled={pending}
        autoFocus
      />
      <FieldRow
        label={t("Project folder")}
        value={folder}
        change={setFolder}
        placeholder={t("Any project")}
        width={300}
        disabled={pending}
        hint={t(
          "Teammates start here, so they read this project's own instructions.",
        )}
      />
      <Row
        title={t("Tasks at once")}
        subtitle={t("How many one member holds before the coordinator waits.")}
      >
        <Menu
          label={t("Tasks at once")}
          value={String(limit)}
          disabled={pending}
          width={72}
          change={(value) => setLimit(Number(value))}
          options={HELD.map((held): [string, string] => [
            String(held),
            String(held),
          ])}
        />
      </Row>
      {members.map((member, index) => (
        <Row key={index} title={t("Role")}>
          <TextInput
            label={t("Role")}
            value={member.role}
            change={(role) => change(index, { ...member, role })}
            placeholder={t("What they do")}
            width={130}
            disabled={pending}
          />
          <Menu
            label={t("Teammate")}
            value={memberValue(member)}
            disabled={pending}
            width={165}
            change={(value) => change(index, memberOf(value, member.role))}
            options={memberPlaces(
              clients,
              snapshot.sessions,
              folder,
              member,
              t("(untitled session)"),
            )}
          />
          <LinkButton
            tone="destructive"
            disabled={pending}
            onClick={() => setMembers(members.filter((_, at) => at !== index))}
          >
            {t("Remove")}
          </LinkButton>
        </Row>
      ))}
      <Row
        title={t("Teammate")}
        subtitle={t("A client, and the role it plays.")}
      >
        <SmallButton
          disabled={pending || members.length >= MOST_MEMBERS}
          onClick={() =>
            setMembers([
              ...members,
              { client: clients[0]?.[0] ?? TALKS[0], role: "" },
            ])
          }
        >
          {t("Add")}
        </SmallButton>
      </Row>
      <FormActions
        t={t}
        pending={pending}
        ready={teamReady(name, members)}
        submit={t("Save")}
        onCancel={onCancel}
      />
    </InlineForm>
  );
}

export function AgentTeamsRow({
  snapshot,
  action,
  t,
}: {
  snapshot: Snapshot;
  action: SettingsPaneProps["action"];
  t: Translate;
}) {
  const [pending, setPending] = useState(false);
  // The team being edited by its place in the list; -1 is one being added.
  const [editing, setEditing] = useState<number | null>(null);
  const teams = snapshot.settings.agentTeams ?? [];
  const clients = talkingClients(snapshot);
  const save = (next: AgentTeam[]) => {
    setPending(true);
    // The rows have no place for a failure, so it shows as a toast.
    void action("set_setting", { key: "agentTeams", value: next })
      .then(() => setEditing(null))
      .catch((failure) => toast.error(String(failure)))
      .finally(() => setPending(false));
  };
  return (
    <>
      <Row
        title={t("Teams")}
        subtitle={t(
          "Who plays which role when an agent splits work across clients.",
        )}
      >
        <SmallButton
          disabled={pending || editing !== null || teams.length >= MOST_TEAMS}
          onClick={() => setEditing(-1)}
        >
          {t("Add a team")}
        </SmallButton>
      </Row>
      {teams.map((team, index) =>
        editing === index ? (
          <TeamForm
            key={team.name}
            team={team}
            snapshot={snapshot}
            pending={pending}
            t={t}
            onCancel={() => setEditing(null)}
            onSave={(edited) =>
              save(teams.map((each, at) => (at === index ? edited : each)))
            }
          />
        ) : (
          <Row
            key={team.name}
            title={team.name}
            subtitle={roster(team, clients) || t("No teammates yet.")}
            detail={team.folder ?? t("Any project")}
          >
            <LinkButton
              disabled={pending || editing !== null}
              onClick={() => setEditing(index)}
            >
              {t("Change")}
            </LinkButton>
            <LinkButton
              tone="destructive"
              disabled={pending || editing !== null}
              onClick={() => save(teams.filter((_, at) => at !== index))}
            >
              {t("Remove")}
            </LinkButton>
          </Row>
        ),
      )}
      {editing === -1 && (
        <TeamForm
          team={{ name: "", limit: 1, members: [] }}
          snapshot={snapshot}
          pending={pending}
          t={t}
          onCancel={() => setEditing(null)}
          onSave={(added) => save([...teams, added])}
        />
      )}
    </>
  );
}
