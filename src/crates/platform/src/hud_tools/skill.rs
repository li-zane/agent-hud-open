//! The skills every client gets under `<skills>/<folder>/SKILL.md`. Agent HUD's
//! copy says so in its frontmatter (`managed-by: agent-hud`), so a folder of
//! that name that someone else wrote is never changed or removed.
use std::{
    fs,
    io::Write,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

/// A skill Agent HUD keeps in every client's skills folder.
pub(super) struct Managed {
    pub folder: &'static str,
    pub text: &'static str,
}

/// Every skill Agent HUD ships. The folder name is the same in every client,
/// so clients that read each other's skills folders count each once.
pub(super) const MANAGED: &[Managed] = &[
    Managed {
        folder: "customize-agent-hud",
        text: include_str!("customize-agent-hud.md"),
    },
    Managed {
        folder: "agent-team",
        text: include_str!("agent-team.md"),
    },
];

/// The first managed skill's folder, kept for callers that name it.
pub const SKILL_FOLDER: &str = MANAGED[0].folder;
const MARK: &str = "managed-by: agent-hud";
const FILE: &str = "SKILL.md";
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SkillState {
    Missing,
    /// Agent HUD's copy, as this version writes it.
    Current,
    /// Agent HUD's copy from another version.
    Older,
    /// A skill of the same name that Agent HUD did not write, or a file
    /// where its folder would go.
    Foreign,
}

impl SkillState {
    /// When managed skills differ, the one that most needs writing wins: a
    /// skill still to write (`Missing`/`Older`) over a foreign folder left as
    /// it is, over one already current. So a foreign copy of one skill never
    /// keeps another from being written.
    fn rank(self) -> u8 {
        match self {
            Self::Current => 0,
            Self::Foreign => 1,
            Self::Older => 2,
            Self::Missing => 3,
        }
    }
}

/// Whether `text` is a SKILL.md Agent HUD wrote: the mark in its frontmatter.
fn ours(text: &str) -> bool {
    let Some(rest) = text.strip_prefix("---\n") else {
        return false;
    };
    rest.split("\n---")
        .next()
        .is_some_and(|front| front.lines().any(|line| line.trim() == MARK))
}

fn state_of(skills: &Path, managed: &Managed) -> SkillState {
    let folder = skills.join(managed.folder);
    match fs::read_to_string(folder.join(FILE)) {
        Ok(text) if text == managed.text => SkillState::Current,
        Ok(text) if ours(&text) => SkillState::Older,
        Ok(_) => SkillState::Foreign,
        // A folder without SKILL.md, such as one our removal left with a
        // .DS_Store in it, holds no skill: it is filled again.
        Err(_) if fs::metadata(&folder).is_ok_and(|metadata| !metadata.is_dir()) => {
            SkillState::Foreign
        }
        Err(_) => SkillState::Missing,
    }
}

/// The managed skills' states as one: whichever most needs writing.
pub(super) fn state(skills: &Path) -> SkillState {
    MANAGED.iter().fold(SkillState::Current, |worst, managed| {
        let one = state_of(skills, managed);
        if one.rank() > worst.rank() {
            one
        } else {
            worst
        }
    })
}

fn add_one(skills: &Path, managed: &Managed) -> Result<bool, String> {
    let folder = skills.join(managed.folder);
    match state_of(skills, managed) {
        SkillState::Current => return Ok(false),
        SkillState::Foreign => {
            return Err(format!(
                "{} already holds a skill Agent HUD did not write; it was left as it is",
                folder.display()
            ))
        }
        SkillState::Missing | SkillState::Older => {}
    }
    fs::create_dir_all(&folder)
        .map_err(|_| format!("{} could not be created", folder.display()))?;
    // Written whole beside it, then renamed over it: a client never reads half a skill.
    let temporary = folder.join(format!(
        ".{FILE}.agent-hud-{}-{}.tmp",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(managed.text.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temporary, folder.join(FILE))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|_| format!("The skill could not be written to {}", folder.display()))?;
    Ok(true)
}

/// Writes each managed skill, or brings Agent HUD's older copy up to date. A
/// folder of the same name that Agent HUD did not write stays untouched and is
/// reported; the others are still written. Returns whether a file changed.
pub(super) fn add(skills: &Path) -> Result<bool, String> {
    let mut changed = false;
    let mut errors = Vec::new();
    for managed in MANAGED {
        match add_one(skills, managed) {
            Ok(wrote) => changed |= wrote,
            Err(error) => errors.push(error),
        }
    }
    if errors.is_empty() {
        Ok(changed)
    } else {
        Err(errors.join("; "))
    }
}

fn remove_one(skills: &Path, managed: &Managed) -> Result<(), String> {
    let folder = skills.join(managed.folder);
    match state_of(skills, managed) {
        SkillState::Missing | SkillState::Foreign => return Ok(()),
        SkillState::Current | SkillState::Older => {}
    }
    // Only what Agent HUD writes: a file someone added beside it keeps the folder.
    fs::remove_file(folder.join(FILE))
        .map_err(|_| format!("The skill could not be removed from {}", folder.display()))?;
    let _ = fs::remove_dir(&folder);
    Ok(())
}

/// Removes Agent HUD's skills; someone else's folder of the same name stays.
pub(super) fn remove(skills: &Path) -> Result<(), String> {
    let mut errors = Vec::new();
    for managed in MANAGED {
        if let Err(error) = remove_one(skills, managed) {
            errors.push(error);
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}
