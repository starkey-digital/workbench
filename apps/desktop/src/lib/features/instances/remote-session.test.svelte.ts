import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

	beforeEach(() => {
		storage = {};
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => storage[k] ?? null,
			setItem: (k: string, v: string) => void (storage[k] = v),
			removeItem: (k: string) => void delete storage[k]
		});
		transport = createMockTransport();
		transport.mockInvoke('load_workbench_settings', () => ({
			claudeAccounts: [{ id: 'work', name: 'Work' }],
			defaultClaudeAccountName: 'Personal'
		}));
		session = new RemoteSession(
			'box',
			{ baseUrl: 'http://box:4317', token: 't' },
			transport,
			{ projects: [project] },
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

	it('counts running sessions by agent', () => {
		emit([workspace('w1')]);
		expect(session.sessionCounts['/srv/repo']).toEqual({ claude: 1, codex: 0 });
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
