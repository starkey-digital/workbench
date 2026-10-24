//! The phone's project management: add, rename and remove one project over
//! HTTP, and browse the host's folders. Its own test binary because it points
//! `WORKBENCH_CONFIG_DIR` at a temp dir.

use serde_json::{json, Value};
use workbench_server::{spawn_embedded, Managers};

const TOKEN: &str = "e2e-token-0123456789abcdef0123456789";

#[tokio::test]
async fn a_client_adds_renames_and_removes_a_project() {
    let tmp = tempfile::tempdir().unwrap();
    let config = tmp.path().join("config");
    let existing = tmp.path().join("existing");
    let picked = tmp.path().join("picked");
    for dir in [&config, &existing, &picked.join(".git")] {
        std::fs::create_dir_all(dir).unwrap();
    }
    std::fs::write(
        config.join("projects.json"),
        json!({ "projects": [{ "name": "existing", "path": existing, "shell": "/bin/zsh" }] })
            .to_string(),
    )
    .unwrap();
    std::env::set_var("WORKBENCH_CONFIG_DIR", &config);

    let managers = Managers::default();
    let mut changes = managers.projects.subscribe();
    let handle = spawn_embedded("127.0.0.1", 0, managers, TOKEN.into())
        .await
        .unwrap();
    let base = format!("http://{}", handle.addr());
    let http = reqwest::Client::new();
    let send = |method: reqwest::Method, path: &str, body: Value| {
        http.request(method, format!("{base}{path}"))
            .bearer_auth(TOKEN)
            .json(&body)
            .send()
    };

    let listing: Value = http
        .get(format!("{base}/fs/folders"))
        .query(&[("path", tmp.path())])
        .bearer_auth(TOKEN)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let picked_entry = listing["folders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["name"] == "picked")
        .unwrap();
    assert_eq!(picked_entry["git"], true);

    let added = send(
        reqwest::Method::POST,
        "/projects",
        json!({ "path": picked_entry["path"], "name": "", "group": "Work" }),
    )
    .await
    .unwrap();
    assert!(added.status().is_success());
    let added: Value = added.json().await.unwrap();
    assert_eq!(added["name"], "picked");
    assert_eq!(added["group"], "Work");
    changes.changed().await.unwrap();

    let again = send(reqwest::Method::POST, "/projects", json!({ "path": picked }))
        .await
        .unwrap();
    assert_eq!(again.status(), 400);

    let renamed = send(
        reqwest::Method::PUT,
        "/projects",
        json!({ "path": existing, "name": "Renamed", "claudeAccountId": "" }),
    )
    .await
    .unwrap();
    assert!(renamed.status().is_success());
    let renamed: Value = renamed.json().await.unwrap();
    assert_eq!(renamed["shell"], "/bin/zsh", "fields a client can't edit stay");
    assert_eq!(renamed["claudeAccountId"], "");

    let unknown_account = send(
        reqwest::Method::PUT,
        "/projects",
        json!({ "path": existing, "name": "x", "claudeAccountId": "nobody" }),
    )
    .await
    .unwrap();
    assert_eq!(unknown_account.status(), 400);

    let removed = send(reqwest::Method::DELETE, "/projects", json!({ "path": picked }))
        .await
        .unwrap();
    assert_eq!(removed.status(), 204);

    let projects: Value = http
        .get(format!("{base}/projects"))
        .bearer_auth(TOKEN)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let names: Vec<_> = projects
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Renamed"]);
}
