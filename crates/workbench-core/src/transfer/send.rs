//! The sending side: packs on a blocking thread straight into the upload, so a
//! large repo is never staged on disk or held in memory.

use std::io::{self, BufWriter, Write};
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use serde::de::DeserializeOwned;
use tokio::sync::mpsc;

use crate::types::{ClaudeImportReport, ProjectCopy};

/// Another Workbench host's control plane.
pub struct Host {
    pub base_url: String,
    pub token: Option<String>,
}

pub struct CopyRequest {
    pub project_path: PathBuf,
    pub project_name: String,
    /// The folder to copy into there; `None`: its clone folder, else home.
    pub parent: Option<String>,
    pub claude_config: bool,
    pub claude_accounts: bool,
}

/// Copies the project, then (if asked) the Claude config. A refused project
/// (its folder already exists there) sends no config; a failed config copy
/// still reports the project, which is there by then.
pub async fn copy_project(host: &Host, request: CopyRequest) -> Result<ProjectCopy> {
    let folder = request
        .project_path
        .file_name()
        .context("project has no folder name")?
        .to_string_lossy()
        .into_owned();
    let mut query = vec![("folder", folder), ("name", request.project_name)];
    if let Some(parent) = request.parent.filter(|p| !p.trim().is_empty()) {
        query.push(("parent", parent));
    }
    let path = request.project_path;
    let project = upload(host, "/transfer/project", &query, move |out| {
        super::project::pack(&path, out)
    })
    .await?;

    let mut copy = ProjectCopy {
        project,
        claude: None,
        claude_error: None,
    };
    if request.claude_config || request.claude_accounts {
        let (default, accounts) = (request.claude_config, request.claude_accounts);
        match upload::<ClaudeImportReport>(host, "/transfer/claude", &[], move |out| {
            super::claude::pack(default, accounts, out)
        })
        .await
        {
            Ok(report) => copy.claude = Some(report),
            Err(e) => copy.claude_error = Some(e.to_string()),
        }
    }
    Ok(copy)
}

/// Packing failed only because the request stopped taking the body (no file
/// read fails with a broken pipe).
fn is_upload_stopped(e: &anyhow::Error) -> bool {
    e.root_cause()
        .downcast_ref::<io::Error>()
        .is_some_and(|e| e.kind() == io::ErrorKind::BrokenPipe)
}

/// Hands each buffered chunk to the request body; fails once the upload stops.
struct ChunkWriter(mpsc::Sender<io::Result<Vec<u8>>>);

impl Write for ChunkWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0
            .blocking_send(Ok(buf.to_vec()))
            .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "upload stopped"))?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

async fn upload<T: DeserializeOwned>(
    host: &Host,
    route: &str,
    query: &[(&str, String)],
    pack: impl FnOnce(&mut BufWriter<ChunkWriter>) -> Result<()> + Send + 'static,
) -> Result<T> {
    let (tx, mut rx) = mpsc::channel::<io::Result<Vec<u8>>>(8);
    let abort = tx.clone();
    let packing = tokio::task::spawn_blocking(move || {
        let mut out = BufWriter::with_capacity(256 * 1024, ChunkWriter(tx));
        let packed = pack(&mut out).and_then(|()| Ok(out.flush()?));
        if let Err(e) = &packed {
            // Dropping the tar and gzip writers finishes the archive, so a pack
            // that failed partway would still reach the server as a valid,
            // partial one; failing the body makes the upload abort instead.
            let _ = abort.blocking_send(Err(io::Error::other(e.to_string())));
        }
        packed
    });
    let body = futures_util::stream::poll_fn(move |cx| rx.poll_recv(cx));

    // No overall or read timeout: the response comes only once the whole body
    // is unpacked, which for a large repo over a slow link takes as long as it
    // takes. Keepalive still notices a peer that went away.
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .tcp_keepalive(Duration::from_secs(30))
        .build()?;
    let mut req = client
        .post(format!("{}{route}", host.base_url.trim_end_matches('/')))
        .query(query)
        .body(reqwest::Body::wrap_stream(body));
    if let Some(token) = &host.token {
        req = req.bearer_auth(token);
    }
    let sent = req.send().await;
    let packed = packing.await.map_err(|e| anyhow!("packing failed: {e}"))?;
    // A server that answered (a refusal stops it reading, which breaks the
    // pack) says what went wrong; without an answer, a pack error is the cause.
    let res = match (sent, packed) {
        (Ok(res), _) => res,
        // The pack failed only because the request stopped taking the body.
        (Err(e), Err(pack)) if is_upload_stopped(&pack) => return Err(e.into()),
        (Err(_), Err(pack)) => return Err(pack),
        (Err(e), Ok(())) => return Err(e.into()),
    };
    let status = res.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        bail!("that server's Workbench can't receive copies yet; update it first");
    }
    if !status.is_success() {
        let message = res
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|v| v["error"].as_str().map(String::from))
            .unwrap_or_else(|| status.to_string());
        bail!("{message}");
    }
    Ok(res.json().await?)
}
