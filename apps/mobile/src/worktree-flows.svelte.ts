import type { ControlPlaneStore } from '@workbench/control-plane-ui';
import type { BranchInfo, WorktreeInfo } from '@workbench/types';
import { freeBranches } from './free-branches.ts';

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** "New worktree" for one project: a new branch off the host's default base, or an existing one. */
export class NewWorktreeFlow {
	mode = $state<'new' | 'existing'>('new');
	name = $state('');
	existing = $state('');
	branches = $state.raw<BranchInfo[]>([]);
	branchesLoading = $state(false);
	branchesError = $state<string | null>(null);
	busy = $state(false);
	error = $state<string | null>(null);
	readonly projectPath: string;
	private readonly store: ControlPlaneStore;
	private branchesAsked = false;

	constructor(store: ControlPlaneStore, projectPath: string) {
		this.store = store;
		this.projectPath = projectPath;
	}

	get free() {
		return freeBranches(this.branches, this.store.worktrees[this.projectPath] ?? []);
	}

	/** Spaces can't be in a branch name; a typed one becomes `-`, as the folder will. */
	get branch(): string {
		return this.mode === 'new' ? this.name.trim().replace(/\s+/g, '-') : this.existing;
	}

	setMode(mode: 'new' | 'existing') {
		this.mode = mode;
		this.error = null;
		if (mode === 'existing' && !this.branchesAsked) void this.loadBranches();
	}

	async loadBranches() {
		this.branchesAsked = true;
		this.branchesLoading = true;
		this.branchesError = null;
		try {
			this.branches = await this.store.listBranches(this.projectPath);
		} catch (e) {
			this.branchesError = errorText(e);
		} finally {
			this.branchesLoading = false;
		}
	}

	/** The new worktree's path; null when refused (the reason in `error`) or already busy. */
	async create(): Promise<string | null> {
		const branch = this.branch;
		if (!branch || this.busy) return null;
		this.busy = true;
		this.error = null;
		try {
			return await this.store.addWorktree(this.projectPath, branch, this.mode === 'new');
		} catch (e) {
			this.error = errorText(e);
			return null;
		} finally {
			this.busy = false;
		}
	}
}

/** Removing one worktree: its folder, optionally its branch, then the host's workspace for it. */
export class WorktreeRemoval {
	deleteBranch = $state(true);
	busy = $state(false);
	error = $state<string | null>(null);
	/** git refused a plain remove (uncommitted or untracked files): the next try forces. */
	needsForce = $state(false);
	/** Set once removed: whether the branch asked to go stayed (unmerged work, or checked out elsewhere). */
	done = $state.raw<{ branchKept: boolean } | null>(null);
	readonly projectPath: string;
	readonly worktree: WorktreeInfo;
	private readonly store: ControlPlaneStore;
	/** Ends the sessions the host has open in the worktree. */
	private readonly closeWorkspaces: (worktreePath: string) => Promise<void>;

	constructor(
		store: ControlPlaneStore,
		projectPath: string,
		worktree: WorktreeInfo,
		closeWorkspaces: (worktreePath: string) => Promise<void>
	) {
		this.store = store;
		this.projectPath = projectPath;
		this.worktree = worktree;
		this.closeWorkspaces = closeWorkspaces;
	}

	async remove(): Promise<boolean> {
		if (this.busy) return false;
		this.busy = true;
		this.error = null;
		const deleteBranch = this.deleteBranch && !!this.worktree.branch;
		try {
			const removed = await this.store.removeWorktree(this.projectPath, this.worktree.path, {
				force: this.needsForce,
				deleteBranch
			});
			await this.closeWorkspaces(this.worktree.path);
			this.done = { branchKept: deleteBranch && removed?.branchDeleted === false };
			return true;
		} catch (e) {
			this.error = errorText(e);
			// Only git's own "use --force" refusal: a dropped connection must never escalate to forcing.
			if (/--force/.test(this.error)) this.needsForce = true;
			return false;
		} finally {
			this.busy = false;
		}
	}
}
