use crate::transfer::send::{copy_project, CopyRequest, Host};
use crate::types::ProjectCopy;

/// Copies a local project (and, if asked, the Claude config) to a remote
/// Workbench server the user has connected.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn copy_project_to_server(
    server_url: String,
    token: Option<String>,
    project_path: String,
    project_name: String,
    parent: Option<String>,
    claude_config: bool,
    claude_accounts: bool,
) -> Result<ProjectCopy, String> {
    let host = Host {
        base_url: server_url,
        token,
    };
    copy_project(
        &host,
        CopyRequest {
            project_path: project_path.into(),
            project_name,
            parent,
            claude_config,
            claude_accounts,
        },
    )
    .await
    .map_err(|e| e.to_string())
}
