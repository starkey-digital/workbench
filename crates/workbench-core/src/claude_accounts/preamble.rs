use std::path::Path;

use super::CONFIG_DIR_ENV;

const POSIX: &[&str] = &["sh", "bash", "zsh", "ksh", "mksh", "dash", "ash", "yash"];

/// What a terminal types before its command so it runs under `config_dir`
/// (`None`: the default login), or nothing for a shell it can't speak for
/// (cmd.exe, which runs no profile, and anything unrecognised): those keep the
/// terminal's env. The env alone loses to a login shell's profile exporting
/// `CLAUDE_CONFIG_DIR`, which ran every session under that login and hid its
/// transcripts from the `--resume` check, so a restart's `--session-id` was
/// refused as "already in use". A statement, not an `env` prefix, so a `claude`
/// alias or function still runs and later commands in the pane inherit it.
pub fn shell_preamble(shell: &str, config_dir: Option<&Path>) -> Option<String> {
    let name = shell_name(shell);
    let dir = match config_dir {
        Some(dir) => Some(dir.to_str()?),
        None => None,
    };
    let var = CONFIG_DIR_ENV;
    Some(match (name.as_str(), dir) {
        (n, Some(dir)) if POSIX.contains(&n) => {
            format!("export {var}={}; ", crate::launch_prompt::shell_quote(dir))
        }
        (n, None) if POSIX.contains(&n) => format!("unset {var}; "),
        // Inside fish's single quotes only `\\` and `\'` are escapes.
        ("fish", Some(dir)) => format!(
            "set -gx {var} '{}'; ",
            dir.replace('\\', "\\\\").replace('\'', "\\'")
        ),
        ("fish", None) => format!("set -e {var}; "),
        ("pwsh" | "powershell", Some(dir)) => {
            format!("$env:{var}='{}'; ", dir.replace('\'', "''"))
        }
        ("pwsh" | "powershell", None) => {
            format!("Remove-Item Env:{var} -ErrorAction SilentlyContinue; ")
        }
        _ => return None,
    })
}

/// `/bin/zsh` → `zsh`, `C:\…\pwsh.exe` → `pwsh`, on any host.
fn shell_name(shell: &str) -> String {
    let file = shell.rsplit(['/', '\\']).next().unwrap_or(shell);
    let file = file.to_ascii_lowercase();
    file.strip_suffix(".exe").unwrap_or(&file).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIR: &str = "/Users/me/it's here";

    #[test]
    fn sets_the_account_in_each_shell_after_its_profile() {
        let dir = Some(Path::new(DIR));
        let cases = [
            (
                "/bin/zsh",
                dir,
                r#"export CLAUDE_CONFIG_DIR='/Users/me/it'"'"'s here'; "#,
            ),
            ("/bin/bash", None, "unset CLAUDE_CONFIG_DIR; "),
            (
                "/opt/homebrew/bin/fish",
                dir,
                r"set -gx CLAUDE_CONFIG_DIR '/Users/me/it\'s here'; ",
            ),
            ("/usr/bin/fish", None, "set -e CLAUDE_CONFIG_DIR; "),
            (
                r"C:\Program Files\PowerShell\7\pwsh.exe",
                dir,
                "$env:CLAUDE_CONFIG_DIR='/Users/me/it''s here'; ",
            ),
            (
                "powershell.exe",
                None,
                "Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue; ",
            ),
        ];
        for (shell, dir, expected) in cases {
            assert_eq!(
                shell_preamble(shell, dir).as_deref(),
                Some(expected),
                "{shell}"
            );
        }
    }

    #[test]
    fn shells_it_cannot_speak_for_keep_the_terminal_env() {
        assert_eq!(shell_preamble(r"C:\Windows\System32\cmd.exe", None), None);
        assert_eq!(shell_preamble("/usr/bin/nu", Some(Path::new("/x"))), None);
    }
}
