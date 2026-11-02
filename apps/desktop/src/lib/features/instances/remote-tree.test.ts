import { describe, expect, it } from 'vitest';
import type { ActiveClaudeSession, WorktreeInfo } from '$types/workbench';
import { projectBranches } from './remote-tree';

const wt = (path: string, branch: string, isMain = false): WorktreeInfo => ({
	path,
	head: '',
	branch,
	isMain
});
const session = (tabId: string, worktreePath?: string): ActiveClaudeSession => ({
	claudeSessionId: tabId,
	tabId,
	label: tabId,
	sessionType: 'claude',
	worktreePath
});
const none = () => undefined;

describe('projectBranches', () => {
	it('nests each session under the branch it runs on', () => {
		const b = projectBranches(
			[wt('/r', 'main', true), wt('/r-feat', 'feat')],
			[session('a'), session('b', '/r-feat')],
			none
		);
		expect(b.main).toMatchObject({ branch: 'main', sessions: [{ tabId: 'a' }] });
		expect(b.main?.worktree).toBeUndefined();
		expect(b.worktrees).toMatchObject([{ branch: 'feat', sessions: [{ tabId: 'b' }] }]);
		expect(b.loose).toEqual([]);
	});

	it("gives a session in a worktree the list doesn't know yet its own row", () => {
		const b = projectBranches([wt('/r', 'main', true)], [session('a', '/r-new')], (p) =>
			p === '/r-new' ? 'new-branch' : undefined
		);
		expect(b.worktrees).toMatchObject([
			{ path: '/r-new', branch: 'new-branch', worktree: { path: '/r-new', branch: 'new-branch' } }
		]);
	});

	it('names an unknown worktree after its folder when nothing else does', () => {
		expect(projectBranches([], [session('a', '/srv/r-x')], none).worktrees[0].branch).toBe('r-x');
	});

	it('leaves main-checkout sessions loose without a main branch (not a repo, or not loaded)', () => {
		const b = projectBranches(undefined, [session('a')], none);
		expect(b.main).toBeUndefined();
		expect(b.loose).toMatchObject([{ tabId: 'a' }]);
	});
});
