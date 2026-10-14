use std::collections::VecDeque;
use std::time::Duration;

use tokio::sync::broadcast::error::TryRecvError;

use super::*;

#[test]
fn a_replay_the_ring_cut_starts_at_a_line() {
    let short: VecDeque<u8> = b"half a line\r\nnext\r\n".iter().copied().collect();
    assert_eq!(replay_of(&short), b"half a line\r\nnext\r\n", "nothing cut");

    let mut full: VecDeque<u8> = b"\x1b[3".iter().copied().collect();
    full.extend(b"1mcut\r\n");
    full.resize(BUFFER_CAP, b'x');
    let replay = replay_of(&full);
    assert!(replay.starts_with(b"xxx"), "from the line after the cut");
    assert_eq!(replay.len(), BUFFER_CAP - b"\x1b[31mcut\r\n".len());
}

#[cfg(unix)]
#[test]
fn peeking_at_an_exit_leaves_the_pid_ours() {
    let mut done = workbench_core::shell::command("true").spawn().unwrap();
    let mut running = workbench_core::shell::command("sleep")
        .arg("5")
        .spawn()
        .unwrap();
    std::thread::sleep(Duration::from_millis(300));
    assert!(peek_exited(done.id() as libc::pid_t));
    assert!(!peek_exited(running.id() as libc::pid_t));
    // Not reaped: the wait still finds the zombie.
    assert!(done.try_wait().unwrap().is_some());
    let _ = running.kill();
    let _ = running.wait();
}

/// A view that fell behind a flood resyncs to the scrollback and goes on from
/// there: the output it was behind on never comes again after it.
#[cfg(unix)]
#[test]
fn a_lagged_view_resyncs_without_repeating_output() {
    let terminals = TerminalManager::new();
    let dir = tempfile::tempdir().unwrap();
    let meta = terminals
        .create(
            dir.path().to_string_lossy().into_owned(),
            None,
            None,
            80,
            24,
            None,
            Some("/bin/sh".into()),
            None,
            None,
            &[],
            false,
        )
        .unwrap();
    let mut tap = terminals.tap(&meta.id).unwrap();
    assert!(terminals.write(&meta.id, b"seq 1 400000; echo DONE\n".to_vec()));

    let mut seen = Vec::new();
    let mut resynced = false;
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        match tap.output.try_recv() {
            Ok(bytes) if resynced => seen.extend(bytes),
            Ok(_) => std::thread::sleep(Duration::from_millis(50)),
            // Each resync starts over: everything before it is on screen.
            Err(TryRecvError::Lagged(_)) => {
                seen = tap.resync();
                resynced = true;
            }
            Err(TryRecvError::Empty) if String::from_utf8_lossy(&seen).contains("\nDONE") => break,
            Err(TryRecvError::Empty) => std::thread::sleep(Duration::from_millis(20)),
            Err(TryRecvError::Closed) => break,
        }
    }
    terminals.kill(&meta.id);
    assert!(resynced, "the flood outran the view");
    let text = String::from_utf8_lossy(&seen);
    let numbers: Vec<u64> = text
        .lines()
        .filter_map(|l| l.trim_end_matches('\r').parse().ok())
        .collect();
    assert!(numbers.len() > 1000, "{} lines", numbers.len());
    assert!(
        numbers.windows(2).all(|w| w[1] == w[0] + 1),
        "no line twice or out of order"
    );
    assert_eq!(numbers.last(), Some(&400000));
}
