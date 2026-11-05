import { describe, expect, it, vi } from 'vitest';
import { ControlPlaneStore } from '@workbench/control-plane-ui';
import { createMockTransport } from '@workbench/transport';
import type { BranchInfo, WorktreeInfo } from '@workbench/types';
import { freeBranches } from './free-branches.ts';
import { NewWorktreeFlow, WorktreeRemoval } from './worktree-flows.svelte.ts';

const branch = (name: string, isRemote = false): BranchInfo => ({
	name,
	sha: '1',
	isCurrent: false,
	isRemote
});
const tree = (path: string, branchName: string, isMain = false): WorktreeInfo => ({
	path,
	head: '1',
	branch: branchName,
	isMain
});

it('offers branches no worktree has out, remote ones under their local name', () => {
	const free = freeBranches(
		[
			branch('main'),
			branch('fix'),
			branch('taken'),
			branch('origin/main', true),
			branch('origin/fix', true),
			branch('origin/pr-12', true),
			branch('upstream/pr-12', true)
		],
		[tree('/repo', 'main', true), tree('/repo-taken', 'taken')]
	);
	expect(free).toEqual([
		{ name: 'fix', remote: false },
		{ name: 'pr-12', remote: true }
	]);
});

function setup() {
	const transport = createMockTransport();
	const requests: unknown[] = [];
	transport.mockInvoke('create_worktree', (a) => {
		requests.push((a as { request: unknown }).request);
		return '/repo-new';
	});
	transport.mockInvoke('list_worktrees', () => [tree('/repo', 'main', true)]);
	transport.mockInvoke('list_branches', () => [branch('main'), branch('fix')]);
	return { store: new ControlPlaneStore(transport), transport, requests };
}

describe('NewWorktreeFlow', () => {
	it('makes a new branch, with spaces turned into dashes', async () => {
		const { store, requests } = setup();
		const flow = new NewWorktreeFlow(store, '/repo');
		flow.name = '  fix the  login ';
		expect(await flow.create()).toBe('/repo-new');
		expect(requests).toEqual([{ repoPath: '/repo', branch: 'fix-the-login', newBranch: true }]);
	});

	it('loads branches once, and checks out an existing one', async () => {
		const { store, requests, transport } = setup();
		const flow = new NewWorktreeFlow(store, '/repo');
		await store.loadWorktrees('/repo');
		const listed = vi.spyOn(store, 'listBranches');
		flow.setMode('existing');
		flow.setMode('new');
		flow.setMode('existing');
		await vi.waitFor(() => expect(flow.free.map((b) => b.name)).toEqual(['fix']));
		expect(listed).toHaveBeenCalledTimes(1);
		flow.existing = 'fix';
		await flow.create();
		expect(requests).toEqual([{ repoPath: '/repo', branch: 'fix', newBranch: false }]);

		transport.mockInvoke('create_worktree', () => {
			throw new Error("a branch named 'fix' already exists");
		});
		expect(await flow.create()).toBeNull();
		expect(flow.error).toMatch(/already exists/);
		expect(flow.busy).toBe(false);
	});
});

describe('WorktreeRemoval', () => {
	function removal(reply: (args: Record<string, unknown>) => unknown) {
		const transport = createMockTransport();
		const sent: Record<string, unknown>[] = [];
		transport.mockInvoke('remove_worktree', (a) => {
			sent.push(a as Record<string, unknown>);
			return reply(a as Record<string, unknown>);
		});
		transport.mockInvoke('list_worktrees', () => []);
		const closed: string[] = [];
		const flow = new WorktreeRemoval(
			new ControlPlaneStore(transport),
			'/repo',
			tree('/repo-x', 'x'),
			async (path) => void closed.push(path)
		);
		return { flow, sent, closed };
	}

	it('removes the folder and branch, then closes its sessions', async () => {
		const { flow, sent, closed } = removal(() => ({ branchDeleted: true }));
		expect(await flow.remove()).toBe(true);
		expect(sent).toEqual([
			{ repoPath: '/repo', worktreePath: '/repo-x', force: false, deleteBranch: true }
		]);
		expect(closed).toEqual(['/repo-x']);
		expect(flow.done).toEqual({ branchKept: false });
	});

	it('says when git kept the branch', async () => {
		const { flow } = removal(() => ({ branchDeleted: false }));
		await flow.remove();
		expect(flow.done).toEqual({ branchKept: true });
	});

	it("offers force only after git's own refusal, and closes nothing on failure", async () => {
		let answer: () => unknown = () => {
			throw new Error('Failed to fetch');
		};
		const { flow, sent, closed } = removal(() => answer());
		expect(await flow.remove()).toBe(false);
		expect(flow.needsForce).toBe(false);

		answer = () => {
			throw new Error(
				"fatal: '/repo-x' contains modified or untracked files, use --force to delete it"
			);
		};
		await flow.remove();
		expect(flow.needsForce).toBe(true);
		expect(closed).toEqual([]);

		answer = () => ({ branchDeleted: true });
		expect(await flow.remove()).toBe(true);
		expect(sent.map((s) => s.force)).toEqual([false, false, true]);
	});
});
