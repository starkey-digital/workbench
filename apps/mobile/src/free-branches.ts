import type { BranchInfo, WorktreeInfo } from '@workbench/types';

/** A branch "Existing" can check out: local, or a remote one with no local copy yet. */
export interface FreeBranch {
	/** What `git worktree add <path> <name>` takes; a remote one becomes a tracking branch. */
	name: string;
	remote: boolean;
}

/** Branches no worktree (the main checkout included) has out; a remote one only when no local
 *  branch shares its name. `origin/feature` is offered as `feature`, which git checks out tracking it. */
export function freeBranches(branches: BranchInfo[], worktrees: WorktreeInfo[]): FreeBranch[] {
	const taken = new Set(worktrees.map((w) => w.branch));
	const local = new Set(branches.filter((b) => !b.isRemote).map((b) => b.name));
	const free = new Map<string, FreeBranch>();
	for (const b of branches) {
		const name = b.isRemote ? b.name.slice(b.name.indexOf('/') + 1) : b.name;
		if (!name || taken.has(name) || (b.isRemote && local.has(name)) || free.has(name)) continue;
		free.set(name, { name, remote: b.isRemote });
	}
	return [...free.values()].sort(
		(a, b) => Number(a.remote) - Number(b.remote) || a.name.localeCompare(b.name)
	);
}
