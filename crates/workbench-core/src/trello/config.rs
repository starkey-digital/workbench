use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::paths;

use super::types::{BoardConfig, TaskLink, TrelloCredentials, TrelloProjectConfig};

/// One read-modify-write of a project config at a time, whichever window asks:
/// the main window writes links while the settings window writes boards.
static WRITING: Mutex<()> = Mutex::new(());

fn trello_config_dir() -> PathBuf {
    paths::workbench_config_dir().join("trello")
}

fn credentials_path() -> PathBuf {
    trello_config_dir().join("credentials.json")
}

fn project_config_path(project_path: &str) -> PathBuf {
    trello_config_dir()
        .join("projects")
        .join(format!("{}.json", paths::encode_project_path(project_path)))
}

pub fn load_credentials() -> Result<Option<TrelloCredentials>> {
    paths::load_json_strict(&credentials_path(), None)
}

pub fn save_credentials(creds: &TrelloCredentials) -> Result<()> {
    paths::save_json(&credentials_path(), creds)
}

pub fn delete_credentials() -> Result<()> {
    let path = credentials_path();
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

pub fn load_project_config(project_path: &str) -> Result<TrelloProjectConfig> {
    paths::load_json_strict(
        &project_config_path(project_path),
        TrelloProjectConfig::default(),
    )
}

fn update_project_config(
    project_path: &str,
    change: impl FnOnce(&mut TrelloProjectConfig),
) -> Result<TrelloProjectConfig> {
    let _writing = WRITING.lock().unwrap_or_else(|e| e.into_inner());
    let mut config = load_project_config(project_path)?;
    change(&mut config);
    paths::save_json(&project_config_path(project_path), &config)?;
    Ok(config)
}

/// Replace the boards, dropping links to boards no longer listed; other links stay as saved.
pub fn save_boards(project_path: &str, boards: Vec<BoardConfig>) -> Result<TrelloProjectConfig> {
    update_project_config(project_path, |config| {
        config
            .task_links
            .retain(|l| boards.iter().any(|b| b.board_id == l.board_id));
        config.boards = boards;
    })
}

/// Link `card_id` to `link` (replacing its old link), or unlink it with `None`.
pub fn set_task_link(
    project_path: &str,
    card_id: &str,
    link: Option<TaskLink>,
) -> Result<TrelloProjectConfig> {
    update_project_config(project_path, |config| {
        match config.task_links.iter().position(|l| l.card_id == card_id) {
            Some(i) => match link {
                Some(link) => config.task_links[i] = link,
                None => drop(config.task_links.remove(i)),
            },
            None => config.task_links.extend(link),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(card: &str, board: &str) -> TaskLink {
        TaskLink {
            card_id: card.into(),
            board_id: board.into(),
            branch: format!("{card}-branch"),
            worktree_path: None,
            project_path: "/p".into(),
        }
    }

    fn board(id: &str) -> BoardConfig {
        BoardConfig {
            board_id: id.into(),
            board_name: id.into(),
            hidden_columns: Vec::new(),
            link_action: None,
            merge_action: None,
        }
    }

    #[test]
    fn links_and_boards_are_written_without_dropping_each_other() {
        paths::test_config_dir();
        let project = "/trello-config-test";
        save_boards(project, vec![board("b1"), board("b2")]).unwrap();
        set_task_link(project, "c1", Some(link("c1", "b1"))).unwrap();
        set_task_link(project, "c2", Some(link("c2", "b2"))).unwrap();

        // A boards save made from a copy that predates both links keeps them.
        let config = save_boards(project, vec![board("b1"), board("b2")]).unwrap();
        assert_eq!(config.task_links.len(), 2);

        // Dropping a board drops its links; unlinking removes just that card.
        let config = save_boards(project, vec![board("b1")]).unwrap();
        assert_eq!(config.task_links.len(), 1);
        let config = set_task_link(project, "c1", None).unwrap();
        assert!(config.task_links.is_empty());
        assert_eq!(load_project_config(project).unwrap().boards.len(), 1);
    }
}
