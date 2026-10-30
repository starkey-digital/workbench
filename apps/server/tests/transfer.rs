//! Copying a project and Claude config here from another host. Its own test
//! binary because it points `WORKBENCH_CONFIG_DIR` and `HOME` at temp dirs.

use serde_json::Value;
use workbench_core::transfer::send::{copy_project, CopyRequest, Host};
use workbench_server::{spawn_embedded, Managers};

const TOKEN: &str = "e2e-token-0123456789abcdef0123456789";

#[tokio::test]
async fn another_host_copies_a_project_and_claude_config_here() {
    let tmp = tempfile::tempdir().unwrap();
    let config = tmp.path().join("config");
    let source = tmp.path().join("source");
    let home = tmp.path().join("home");
    let parent = tmp.path().join("repos");
    std::fs::create_dir_all(&config).unwrap();
    std::fs::create_dir_all(source.join("node_modules")).unwrap();
    std::fs::create_dir_all(home.join(".claude")).unwrap();
    // Past axum's 2 MB default body limit, which must not apply here.
    let big: Vec<u8> = (0..3_000_000u64).map(|i| (i * 7919 % 251) as u8).collect();
    std::fs::write(source.join("big.bin"), &big).unwrap();
    std::fs::write(source.join(".env"), "KEY=1").unwrap();
    std::env::set_var("WORKBENCH_CONFIG_DIR", &config);
    std::env::set_var("HOME", &home);

    let mut project = Vec::new();
    workbench_core::transfer::project::pack(&source, &mut project).unwrap();
    let mut claude = Vec::new();
    std::fs::write(home.join(".claude/CLAUDE.md"), "rules").unwrap();
    workbench_core::transfer::claude::pack(true, false, &mut claude).unwrap();
    std::fs::remove_file(home.join(".claude/CLAUDE.md")).unwrap();

    let managers = Managers::default();
    let mut changes = managers.projects.subscribe();
    let handle = spawn_embedded("127.0.0.1", 0, managers, TOKEN.into())
        .await
        .unwrap();
    let base = format!("http://{}", handle.addr());
    let http = reqwest::Client::new();
    let post_project = |body: Vec<u8>| {
        http.post(format!("{base}/transfer/project"))
            .query(&[
                ("parent", parent.to_str().unwrap()),
                ("folder", "copied"),
                ("name", "Copied"),
            ])
            .bearer_auth(TOKEN)
            .body(body)
            .send()
    };

    let res = post_project(project.clone()).await.unwrap();
    assert!(res.status().is_success(), "{}", res.text().await.unwrap());
    let added: Value = res.json().await.unwrap();
    assert_eq!(added["name"], "Copied");
    changes.changed().await.unwrap();
    let dest = parent.join("copied");
    assert_eq!(std::fs::read(dest.join("big.bin")).unwrap(), big);
    assert_eq!(std::fs::read_to_string(dest.join(".env")).unwrap(), "KEY=1");
    assert!(!dest.join("node_modules").exists());

    let again = post_project(project).await.unwrap();
    assert_eq!(again.status(), 400);

    let unauthorized = http
        .post(format!("{base}/transfer/claude"))
        .body(claude.clone())
        .send()
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), 401);

    let report: Value = http
        .post(format!("{base}/transfer/claude"))
        .bearer_auth(TOKEN)
        .body(claude)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(report["written"], 1);
    assert_eq!(
        std::fs::read_to_string(home.join(".claude/CLAUDE.md")).unwrap(),
        "rules"
    );

    let host = Host {
        base_url: base.clone(),
        token: Some(TOKEN.into()),
    };
    let request = || CopyRequest {
        project_path: source.clone(),
        project_name: "Sent".into(),
        parent: Some(parent.to_string_lossy().into_owned()),
        claude_config: false,
        claude_accounts: false,
    };
    let copy = copy_project(&host, request()).await.unwrap();
    assert_eq!(copy.project.name, "Sent");
    assert!(copy.claude.is_none());
    assert_eq!(std::fs::read(parent.join("source/big.bin")).unwrap(), big);
    let err = copy_project(&host, request()).await.unwrap_err();
    assert!(err.to_string().contains("already exists"), "{err}");
}
