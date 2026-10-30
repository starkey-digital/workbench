//! `POST /transfer/project` and `POST /transfer/claude`: another host copying a
//! project, or its Claude config, here (`workbench_core::transfer`). The body is
//! a gzipped tar, unpacked as it streams in, so a large repo never sits in memory.

use std::io::{self, Read};

use axum::body::{Body, Bytes};
use axum::extract::{Query, State};
use axum::Json;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::mpsc;

use crate::error::ApiResult;
use crate::routes::blocking;
use crate::state::AppState;

/// The request body as a blocking `Read`, fed chunk by chunk from the async side.
struct BodyReader {
    chunks: mpsc::Receiver<Result<Bytes, axum::Error>>,
    current: Bytes,
}

impl Read for BodyReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        while self.current.is_empty() {
            match self.chunks.blocking_recv() {
                Some(Ok(chunk)) => self.current = chunk,
                Some(Err(e)) => return Err(io::Error::other(e)),
                None => return Ok(0),
            }
        }
        let n = out.len().min(self.current.len());
        out[..n].copy_from_slice(&self.current.split_to(n));
        Ok(n)
    }
}

/// Runs `import` on a blocking thread, reading `body` as it arrives. An import
/// that fails early drops the reader, which stops the upload being read.
async fn import_body<T, F>(body: Body, import: F) -> ApiResult<T>
where
    F: FnOnce(BodyReader) -> anyhow::Result<T> + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = mpsc::channel(16);
    let reader = BodyReader {
        chunks: rx,
        current: Bytes::new(),
    };
    let pump = async move {
        let mut stream = body.into_data_stream();
        while let Some(chunk) = stream.next().await {
            if tx.send(chunk).await.is_err() {
                break;
            }
        }
    };
    let (result, ()) = tokio::join!(blocking(move || import(reader)), pump);
    result
}

#[derive(Deserialize)]
pub(crate) struct ProjectQuery {
    /// Unset: the host's clone folder, else home.
    parent: Option<String>,
    folder: String,
    #[serde(default)]
    name: String,
}

pub(crate) async fn import_project(
    State(state): State<AppState>,
    Query(query): Query<ProjectQuery>,
    body: Body,
) -> ApiResult<Json<Value>> {
    let project = import_body(body, move |reader| {
        workbench_core::transfer::project::import(
            query.parent.as_deref(),
            &query.folder,
            &query.name,
            reader,
        )
    })
    .await?;
    state.projects.notify();
    Ok(Json(serde_json::to_value(project)?))
}

pub(crate) async fn import_claude(
    State(state): State<AppState>,
    body: Body,
) -> ApiResult<Json<Value>> {
    let report = import_body(body, workbench_core::transfer::claude::import).await?;
    if !report.accounts_added.is_empty() {
        state.settings.notify();
    }
    Ok(Json(serde_json::to_value(report)?))
}
