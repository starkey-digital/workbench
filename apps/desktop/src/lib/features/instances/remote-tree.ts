import type { ActiveClaudeSession, WorktreeInfo } from '$types/workbench';

export interface BranchRow {
	/** What `RemoteSession.open` takes: none for the main checkout. */
	worktree?: WorktreeInfo;
	path: string;
	branch: string;
	sessions: ActiveClaudeSession[];
}

export interface ProjectBranches {
	main?: BranchRow;
	worktrees: BranchRow[];
	/** Main-checkout sessions of a project with no main branch row (not a repo, or not loaded). */
	loose: ActiveClaudeSession[];
}

/**
 * A remote project's branch rows (main checkout first, then worktrees), each
 * with the sessions running on it. A session in a worktree the cached list
 * lacks (made since it loaded) still gets a row, named by `branchOf`.
 */
export function projectBranches(
	worktrees: WorktreeInfo[] | undefined,
	sessions: ActiveClaudeSession[],
	branchOf: (worktreePath: string) => string | undefined
): ProjectBranches {
	const on = (path: string | undefined) => sessions.filter((s) => s.worktreePath === path);
	const listed = worktrees ?? [];
	const mainWt = listed.find((w) => w.isMain);
	const rows: BranchRow[] = listed
		.filter((w) => !w.isMain)
		.map((w) => ({ worktree: w, path: w.path, branch: w.branch, sessions: on(w.path) }));
	const known = new Set(rows.map((r) => r.path));
	for (const s of sessions) {
		const path = s.worktreePath;
		if (!path || known.has(path)) continue;
		known.add(path);
		const branch = branchOf(path) ?? path.split('/').pop() ?? path;
		rows.push({
			worktree: { path, head: '', branch, isMain: false },
			path,
			branch,
			sessions: on(path)
		});
	}
	return {
		main: mainWt && {
			path: mainWt.path,
			branch: mainWt.branch || '(detached)',
			sessions: on(undefined)
		},
		worktrees: rows,
		loose: mainWt ? [] : on(undefined)
	};
}
