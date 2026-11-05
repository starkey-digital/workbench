import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { ProjectConfig, ProjectEdit } from '$types/workbench';
import { flushSync } from 'svelte';
import { createMockTransport, type MockTransport } from '@workbench/transport';
import type { ServerWorkspace, WorkspaceSnapshot } from '$types/workspace';
import { releaseChat } from '$features/chat/chat-registry.svelte';
import type { WorkbenchSettingsStore } from '$stores/workbench-settings.svelte';
import { RemoteSession } from './remote-session.svelte';

vi.mock('$features/chat/chat-registry.svelte', () => ({
	releaseChat: vi.fn(),
	followPane: vi.fn()
}));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

const settings = {
	defaultClaudeView: 'terminal',
	terminalRenderer: 'native'
} as unknown as WorkbenchSettingsStore;
const project = { name: 'Repo', path: '/srv/repo' };

let storage: Record<string, string>;

function workspace(id: string, over: Partial<ServerWorkspace> = {}): ServerWorkspace {
	return {
		id,
		projectPath: '/srv/repo',
		projectName: 'Repo',
		renderer: 'xterm',
		tabs: [
			{
				id: `${id}-t`,
				label: 'claude',
				kind: 'claude',
				split: 'horizontal',
				panes: [
					{
						id: `${id}-p`,
						kind: 'claude',
						terminalId: `${id}-term`,
						status: 'running',
						title: null,
						busy: false,
						waiting: null,
						error: null,
						generation: 1
					}
				]
			}
		],
		...over
	};
}

describe('RemoteSession', () => {
	let transport: MockTransport;
	let session: RemoteSession;
	let updateProject: Mock<(edit: ProjectEdit) => Promise<ProjectConfig>>;

	beforeEach(() => {
		updateProject = vi.fn(async (edit: ProjectEdit) => edit);
		storage = {};
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => storage[k] ?? null,
			setItem: (k: string, v: string) => void (storage[k] = v),
			removeItem: (k: string) => void delete storage[k]
		});
		transport = createMockTransport();
		transport.mockInvoke('load_workbench_settings', () => ({
			claudeAccounts: [{ id: 'work', name: 'Work' }],
			defaultClaudeAccountName: 'Personal',
			activeClaudeAccount: 'work'
		}));
		session = new RemoteSession(
			'box',
			{ baseUrl: 'http://box:4317', token: 't' },
			transport,
			{ projects: [project], updateProject },
			{ settings }
		);
	});

	afterEach(() => {
		session.dispose();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	function emit(workspaces: ServerWorkspace[]) {
		const snapshot: WorkspaceSnapshot = { rev: 1, workspaces };
		transport.emitWorkspace(snapshot, true);
		flushSync();
	}

	it("lists the host's Claude logins, not this machine's", async () => {
		await vi.waitFor(() => expect(session.server.accounts?.claudeAccounts).toHaveLength(1));
		expect(session.server.accounts?.defaultAccountName).toBe('Personal');
		expect(session.server.remote).toBe(true);
	});

	it("switches the host's account for new sessions", async () => {
		await vi.waitFor(() => expect(session.activeAccountId).toBe('work'));
		const sent: unknown[] = [];
		transport.mockInvoke('set_active_claude_account', (args) => void sent.push(args));
		await session.setActiveAccount(undefined);
		expect(sent).toEqual([{ id: null }]);
		expect(session.activeAccountId).toBeUndefined();
	});

	it('keeps the account when the host refuses the switch', async () => {
		await vi.waitFor(() => expect(session.activeAccountId).toBe('work'));
		transport.mockInvoke('set_active_claude_account', () => {
			throw new Error('unknown account');
		});
		await session.setActiveAccount(undefined);
		expect(session.activeAccountId).toBe('work');
		expect(session.accountError).toContain('unknown account');
	});

	it("a poll that read before a switch doesn't undo it or hide its error", async () => {
		await vi.waitFor(() => expect(session.activeAccountId).toBe('work'));
		let answer: (v: unknown) => void = () => {};
		transport.mockInvoke('load_workbench_settings', () => new Promise((r) => (answer = r)));
		transport.mockInvoke('set_active_claude_account', () => undefined);
		const poll = session.loadAccounts();
		await session.setActiveAccount(undefined);
		answer({ claudeAccounts: [{ id: 'work', name: 'Work' }], activeClaudeAccount: 'work' });
		await poll;
		expect(session.activeAccountId).toBeUndefined();

		transport.mockInvoke('set_active_claude_account', () => {
			throw new Error('unknown account');
		});
		await session.setActiveAccount('gone');
		transport.mockInvoke('load_workbench_settings', () => ({ claudeAccounts: [] }));
		await session.loadAccounts();
		expect(session.accountError).toContain('unknown account');
	});

	it("lists the host's logins, its default as ''", async () => {
		await vi.waitFor(() => expect(session.claudeAccounts).toHaveLength(1));
		expect(session.accountChoices).toEqual([
			{ id: '', name: 'Personal' },
			{ id: 'work', name: 'Work' }
		]);
	});

	it("sets a project's account on the host, keeping its name and group", async () => {
		const grouped = { ...project, group: 'Clients' };
		await session.setProjectAccount(grouped, 'work');
		await session.setProjectAccount(grouped, undefined);
		expect(updateProject.mock.calls).toEqual([
			[{ path: '/srv/repo', name: 'Repo', group: 'Clients', claudeAccountId: 'work' }],
			[{ path: '/srv/repo', name: 'Repo', group: 'Clients', claudeAccountId: undefined }]
		]);
	});

	it('says why when the host refuses a project account', async () => {
		updateProject.mockRejectedValueOnce(new Error('unknown account'));
		await session.setProjectAccount(project, 'gone');
		expect(session.accountError).toContain('unknown account');
	});

	it('starts a session in a worktree, opening its workspace first', async () => {
		transport.mockWorkspaceCommand((cmd) =>
			cmd.type === 'openWorkspace' ? { rev: 1, workspaceId: 'w9' } : { rev: 2 }
		);
		await session.newSession(project, { path: '/srv/repo-wt', branch: 'feat' } as never);
		expect(transport.workspaceCommands.map((c) => c.type)).toEqual(['openWorkspace', 'newSession']);
		expect(transport.workspaceCommands[1]).toMatchObject({ workspaceId: 'w9' });
	});

	it('opens a project on the host in xterm', async () => {
		await session.open(project);
		expect(transport.workspaceCommands).toEqual([
			{ type: 'openWorkspace', projectPath: '/srv/repo', projectName: 'Repo', renderer: 'xterm' }
		]);
	});

	it('shows a workspace already open instead of opening another', async () => {
		emit([workspace('w1'), workspace('w2', { worktreePath: '/srv/repo-wt', branch: 'feat' })]);
		await session.open(project, {
			path: '/srv/repo-wt',
			branch: 'feat',
			isMain: false
		} as never);
		expect(session.workspaces.selectedId).toBe('w2');
		await session.open(project);
		expect(session.workspaces.selectedId).toBe('w1');
		expect(transport.workspaceCommands).toEqual([]);
	});

	it('names a workspace whose project the list lacks yet', () => {
		expect(session.projectFor({ projectPath: '/srv/new', projectName: 'New' })).toEqual({
			name: 'New',
			path: '/srv/new'
		});
	});

	it('on removal, releases its chats and forgets its device state', () => {
		emit([workspace('w1')]);
		session.workspaces.selectedId = 'w1';
		expect(storage['workbench.workspace-ui.box']).toBeDefined();
		session.dispose();
		expect(releaseChat).toHaveBeenCalledWith('w1-p');
		expect(storage['workbench.workspace-ui.box']).toBeUndefined();
	});
});
