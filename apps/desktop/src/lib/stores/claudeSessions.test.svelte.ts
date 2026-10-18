import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	invokeSpy,
	mockInvoke,
	clearInvokeMocks,
	emitMockEvent,
	clearListeners,
	listenSpy
} from '../../test/tauri-mocks';
import { ClaudeSessionStore, type AttentionTarget } from './claudeSessions.svelte';
import type { IntegrationApprovalStore } from './integration-approval.svelte';
import type { WorkspaceStore } from './workspaces.svelte';
import type { ProjectStore } from './projects.svelte';
import type { AgentAction, AgentAttention, DiscoveredClaudeSession } from '$types/workbench';

function createMockWorkspaceStore(workspaces: unknown[] = []) {
	return {
		workspaces,
		addAISession: vi.fn(async () => null),
		addAIByProject: vi.fn(async () => null),
		renameTab: vi.fn(async () => null),
		findAIPaneContext: vi.fn(),
		focusPane: vi.fn(() => true),
		pane: vi.fn((): { id: string } | undefined => undefined),
		paneForSession: vi.fn((): { id: string } | undefined => undefined)
	} as unknown as WorkspaceStore;
}

function createMockProjectStore() {
	return {
		getByPath: vi.fn((path: string) => ({ path, name: 'Test' }))
	} as unknown as ProjectStore;
}

function createMockIntegrationApprovalStore() {
	return {
		ensureIntegration: vi.fn(() => Promise.resolve(true))
	} as unknown as IntegrationApprovalStore;
}

describe('ClaudeSessionStore', () => {
	let store: ClaudeSessionStore;
	let mockWorkspaceStore: WorkspaceStore;
	let mockProjectStore: ProjectStore;
	let mockIntegrationApprovalStore: IntegrationApprovalStore;

	beforeEach(() => {
		mockWorkspaceStore = createMockWorkspaceStore();
		mockProjectStore = createMockProjectStore();
		mockIntegrationApprovalStore = createMockIntegrationApprovalStore();
		store = new ClaudeSessionStore(
			mockWorkspaceStore,
			mockProjectStore,
			mockIntegrationApprovalStore
		);
	});

	afterEach(() => {
		clearInvokeMocks();
		clearListeners();
	});

	describe('constructor', () => {
		it('registers 2 event listeners', () => {
			expect(listenSpy).toHaveBeenCalledTimes(2);
		});

		it('registers an agent:attention listener', () => {
			expect(listenSpy).toHaveBeenCalledWith('agent:attention', expect.any(Function));
		});

		it('registers a codex:notify listener', () => {
			expect(listenSpy).toHaveBeenCalledWith('codex:notify', expect.any(Function));
		});
	});

	describe('discoverSessions', () => {
		const at = (sessionId: string, timestamp: string, accountId?: string) => ({
			sessionId,
			label: sessionId,
			timestamp,
			...(accountId && { accountId })
		});

		it('keeps a resume list per agent and cwd', async () => {
			mockInvoke('discover_claude_sessions', (args) =>
				(args as { projectPath: string }).projectPath === '/a'
					? [at('a-1', '2025-01-01T00:00:00Z')]
					: [at('b-1', '2025-01-01T00:00:00Z')]
			);
			mockInvoke('discover_codex_sessions', () => [at('c-1', '2025-01-01T00:00:00Z')]);

			const result = await store.discoverSessions('/a');
			await store.discoverSessions('/b');
			await store.discoverSessions('/a', 'codex');

			expect(invokeSpy).toHaveBeenCalledWith('discover_claude_sessions', { projectPath: '/a' });
			expect(result.map((s) => s.sessionId)).toEqual(['a-1']);
			expect(store.discoveredFor('/a').map((s) => s.sessionId)).toEqual(['a-1']);
			expect(store.discoveredFor('/b').map((s) => s.sessionId)).toEqual(['b-1']);
			expect(store.discoveredFor('/a', 'codex').map((s) => s.sessionId)).toEqual(['c-1']);
		});

		it('keeps the newest scan when an older one finishes last', async () => {
			let release: (v: DiscoveredClaudeSession[]) => void = () => {};
			mockInvoke('discover_claude_sessions', () => new Promise((r) => (release = r)));
			const first = store.discoverSessions('/a');
			const releaseFirst = release;
			const second = store.discoverSessions('/a');
			release([at('new', '2025-01-02T00:00:00Z')]);
			await second;
			releaseFirst([at('old', '2025-01-01T00:00:00Z')]);
			await first;

			expect(store.discoveredFor('/a').map((s) => s.sessionId)).toEqual(['new']);
		});

		it('lists a session id once, the newest copy', async () => {
			mockInvoke('discover_claude_sessions', () => [
				at('dup', '2025-01-01T00:00:00Z', 'old'),
				at('one', '2025-01-01T00:00:00Z'),
				at('dup', '2025-01-03T00:00:00Z', 'new')
			]);

			await store.discoverSessions('/a');

			expect(store.discoveredFor('/a')).toEqual([
				at('one', '2025-01-01T00:00:00Z'),
				at('dup', '2025-01-03T00:00:00Z', 'new')
			]);
		});

		it("resumes with the account from the workspace's own list", async () => {
			mockWorkspaceStore = createMockWorkspaceStore([
				{ id: 'ws-a', projectPath: '/a', terminalTabs: [] },
				{ id: 'ws-b', projectPath: '/b', terminalTabs: [] }
			]);
			Object.assign(mockWorkspaceStore, { resumeAISession: vi.fn(async () => null) });
			store = new ClaudeSessionStore(
				mockWorkspaceStore,
				mockProjectStore,
				mockIntegrationApprovalStore
			);
			mockInvoke('discover_claude_sessions', (args) =>
				(args as { projectPath: string }).projectPath === '/a'
					? [at('s', '2025-01-01T00:00:00Z', 'acct-a')]
					: [at('s', '2025-01-01T00:00:00Z', 'acct-b')]
			);
			await store.discoverSessions('/a');
			await store.discoverSessions('/b');

			await store.resumeSession('ws-a', 's', 'label');

			expect(mockWorkspaceStore.resumeAISession).toHaveBeenCalledWith(
				'ws-a',
				's',
				'label',
				'claude',
				'acct-a'
			);
		});

		it('handles invoke failure gracefully', async () => {
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			mockInvoke('discover_claude_sessions', () => {
				throw new Error('discovery failed');
			});

			const result = await store.discoverSessions('/projects/test');

			expect(result).toEqual([]);
			expect(errorSpy).toHaveBeenCalledWith(
				'[ClaudeSessionStore] Failed to discover claude sessions:',
				expect.any(Error)
			);
			errorSpy.mockRestore();
		});
	});

	describe('removeDiscoveredSession', () => {
		it('stays removed when a scan that started before it finishes', async () => {
			let answer: (v: DiscoveredClaudeSession[]) => void = () => {};
			const s1 = { sessionId: 's-1', label: 'One', timestamp: '2025-01-01T00:00:00Z' };
			mockInvoke('discover_claude_sessions', () => [s1]);
			await store.discoverSessions('/a');
			mockInvoke('discover_claude_sessions', () => new Promise((r) => (answer = r)));
			const scan = store.discoverSessions('/a');
			store.removeDiscoveredSession('/a', 's-1');
			answer([s1]);
			await scan;
			expect(store.discoveredFor('/a')).toEqual([]);
		});

		it('removes from that cwd and agent only', async () => {
			mockInvoke('discover_claude_sessions', () => [
				{ sessionId: 's-1', label: 'One', timestamp: '2025-01-01T00:00:00Z' },
				{ sessionId: 's-2', label: 'Two', timestamp: '2025-01-02T00:00:00Z' }
			]);
			mockInvoke('discover_codex_sessions', () => [
				{ sessionId: 's-1', label: 'Codex', timestamp: '2025-01-01T00:00:00Z' }
			]);
			await store.discoverSessions('/a');
			await store.discoverSessions('/b');
			await store.discoverSessions('/a', 'codex');

			store.removeDiscoveredSession('/a', 's-1');

			expect(store.discoveredFor('/a').map((s) => s.sessionId)).toEqual(['s-2']);
			expect(store.discoveredFor('/b').map((s) => s.sessionId)).toEqual(['s-1', 's-2']);
			expect(store.discoveredFor('/a', 'codex').map((s) => s.sessionId)).toEqual(['s-1']);
		});
	});

	describe('busy and waiting come from the snapshot', () => {
		const tabWith = (pane: Record<string, unknown>) => ({
			id: 'ws-1',
			projectPath: '/test',
			projectName: 'Test',
			terminalTabs: [
				{
					id: 'tab-1',
					label: 'Claude 1',
					split: 'horizontal',
					type: 'claude',
					panes: [{ id: 'pane-1', type: 'claude', ...pane }]
				},
				{
					id: 'tab-2',
					label: 'Terminal 1',
					split: 'horizontal',
					type: 'shell',
					panes: [{ id: 'shell-1', type: 'shell', busy: true }]
				}
			],
			activeTerminalTabId: 'tab-1'
		});
		const showing = (pane: Record<string, unknown>) =>
			((mockWorkspaceStore as { workspaces: unknown[] }).workspaces = [tabWith(pane)]);

		it('is in progress while busy, and awaiting input (not in progress) while waiting', () => {
			showing({ busy: true, waiting: null });
			expect(store.panesInProgress.has('pane-1')).toBe(true);
			expect(store.panesAwaitingInput.has('pane-1')).toBe(false);
		});

		it('counts a waiting pane as awaiting input only', () => {
			showing({ busy: true, waiting: { id: 'r1', tool: 'Bash', preview: 'ls' } });
			expect(store.panesInProgress.has('pane-1')).toBe(false);
			expect(store.panesAwaitingInput.has('pane-1')).toBe(true);
		});

		it('ignores shells', () => {
			showing({ busy: false });
			expect(store.panesInProgress.has('shell-1')).toBe(false);
			expect(store.activeSessionsByProject['/test']).toEqual([
				expect.objectContaining({ tabId: 'tab-1', needsAttention: true, awaitingInput: false })
			]);
		});

		it('goes to the waiting pane after the one on screen', () => {
			const waiting = { busy: true, waiting: { id: 'r1', tool: 'Bash', preview: 'ls' } };
			const ws = tabWith(waiting);
			ws.terminalTabs[1] = {
				id: 'tab-3',
				label: 'Claude 2',
				split: 'horizontal',
				type: 'claude',
				panes: [{ id: 'pane-2', type: 'claude', ...waiting }]
			};
			const mock = mockWorkspaceStore as { workspaces: unknown[]; activeWorkspace?: unknown };
			mock.workspaces = [ws];

			store.focusNextWaiting();
			expect(mockWorkspaceStore.focusPane).toHaveBeenLastCalledWith('pane-1');

			mock.activeWorkspace = ws;
			store.focusNextWaiting();
			expect(mockWorkspaceStore.focusPane).toHaveBeenLastCalledWith('pane-2');

			mock.activeWorkspace = { ...ws, activeTerminalTabId: 'tab-3' };
			store.focusNextWaiting();
			expect(mockWorkspaceStore.focusPane).toHaveBeenLastCalledWith('pane-1');
		});
	});

	describe('Codex label discovery', () => {
		const sessionId = 'abcd1234-5678-9012-3456-789012345678';
		const discoverCalls = () =>
			invokeSpy.mock.calls.filter(([cmd]) => cmd === 'discover_codex_sessions').length;

		/** Wait until `count` discoveries have been issued *and* their continuations ran. */
		async function settleDiscovery(count: number) {
			await vi.waitFor(() => expect(discoverCalls()).toBe(count));
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		const notify = (turnComplete: boolean) =>
			emitMockEvent('codex:notify', {
				paneId: 'pane-1',
				sessionId,
				...(turnComplete ? { notifyEvent: 'agent-turn-complete' } : {})
			});

		beforeEach(() => {
			(mockWorkspaceStore as { workspaces: unknown[] }).workspaces = [
				{
					id: 'ws-1',
					projectPath: '/test',
					projectName: 'Test',
					terminalTabs: [
						{
							id: 'tab-1',
							label: 'Codex 1',
							split: 'horizontal',
							type: 'codex',
							panes: [{ id: 'pane-1', type: 'codex' }]
						}
					],
					activeTerminalTabId: 'tab-1'
				}
			];
			(mockWorkspaceStore.findAIPaneContext as ReturnType<typeof vi.fn>).mockReturnValue({
				projectPath: '/test',
				cwd: '/test'
			});
		});

		it('recovers the real label once the first user message exists on disk', async () => {
			// The first notify can come before the thread's first message is on disk.
			mockInvoke('discover_codex_sessions', () => [
				{ sessionId, label: 'Session abcd1234', timestamp: '' }
			]);
			notify(false);
			// Let that first discovery fully settle before the next event, so the
			// "no label yet" result is actually recorded.
			await settleDiscovery(1);

			mockInvoke('discover_codex_sessions', () => [
				{ sessionId, label: 'Fix the polling bug', timestamp: '' }
			]);
			notify(true);

			await vi.waitFor(() =>
				expect(mockWorkspaceStore.renameTab).toHaveBeenCalledWith('tab-1', 'Fix the polling bug')
			);
		});

		it('does not rediscover once a label is resolved', async () => {
			mockInvoke('discover_codex_sessions', () => [
				{ sessionId, label: 'Already named', timestamp: '' }
			]);
			notify(false);
			await settleDiscovery(1);

			for (let i = 0; i < 3; i++) {
				notify(true);
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			expect(discoverCalls()).toBe(1);
		});

		it('does not rescan on events that cannot have named the thread', async () => {
			mockInvoke('discover_codex_sessions', () => [
				{ sessionId, label: 'Session abcd1234', timestamp: '' }
			]);
			notify(false);
			await settleDiscovery(1);

			for (let i = 0; i < 5; i++) {
				notify(false);
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			expect(discoverCalls()).toBe(1);
		});

		it('stops retrying discovery after the attempt cap', async () => {
			mockInvoke('discover_codex_sessions', () => [
				{ sessionId, label: 'Session abcd1234', timestamp: '' }
			]);

			for (let i = 0; i < 12; i++) {
				notify(true);
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			expect(discoverCalls()).toBe(6);
		});
	});

	describe('agent:attention events', () => {
		const attention = (kind: AgentAttention['kind'], over: Partial<AgentAttention> = {}) => ({
			kind,
			agent: 'claude',
			sessionId: 'sess-1',
			previousIds: [],
			paneId: null,
			terminalId: 'term-1',
			projectPath: '/repos/app',
			worktreePath: null,
			title: 'Fix the build',
			waiting: null,
			busy: false,
			...over
		});
		let notified: [AttentionTarget, AgentAttention['kind']][];

		beforeEach(() => {
			notified = [];
			store.onAttention((target, kind) => notified.push([target, kind]));
		});

		it('notifies the pane the snapshot shows, by its pane id', () => {
			(mockWorkspaceStore.pane as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
				id === 'pane-1' ? { id } : undefined
			);

			emitMockEvent('agent:attention', attention('waiting', { paneId: 'pane-1' }));
			emitMockEvent('agent:attention', attention('turnEnded', { paneId: 'pane-1' }));

			const pane = { paneId: 'pane-1', sessionId: 'sess-1' };
			expect(notified).toEqual([
				[pane, 'waiting'],
				[pane, 'turnEnded']
			]);
		});

		it('falls back to the pane on that session', () => {
			(mockWorkspaceStore.paneForSession as ReturnType<typeof vi.fn>).mockReturnValue({
				id: 'pane-2'
			});
			emitMockEvent('agent:attention', attention('waiting', { paneId: 'gone' }));
			expect(notified).toEqual([[{ paneId: 'pane-2', sessionId: 'sess-1' }, 'waiting']]);
		});

		it('notifies about a session no pane shows, by its title', () => {
			emitMockEvent('agent:attention', attention('waiting'));
			emitMockEvent('agent:attention', attention('resolved'));
			emitMockEvent('agent:attention', attention('turnEnded', { title: null }));
			const phone = { id: 'sess-1', projectPath: '/repos/app' };
			expect(notified).toEqual([
				[{ ...phone, label: 'Fix the build' }, 'waiting'],
				[{ ...phone, label: 'Fix the build' }, 'resolved'],
				[{ ...phone, label: 'Session sess-1' }, 'turnEnded']
			]);
		});
	});

	describe('startSession', () => {
		it('delegates to workspaces.addAISession', async () => {
			await store.startSession('ws-1', 'claude');
			expect(mockWorkspaceStore.addAISession).toHaveBeenCalledWith('ws-1', 'claude');
		});
	});

	describe('startSessionByProject', () => {
		it('starts a session in the project, which the server opens if need be', async () => {
			await store.startSessionByProject('/projects/test', 'claude');
			expect(mockWorkspaceStore.addAIByProject).toHaveBeenCalledWith(
				{ path: '/projects/test', name: 'Test' },
				'claude'
			);
		});
	});

	describe('startAgentActionByProject', () => {
		it('opens project and starts a labeled action session by project', async () => {
			const action: AgentAction = {
				id: 'action-1',
				name: 'Security Scan',
				prompt: 'Scan this codebase for security issues',
				target: 'both',
				category: 'Security',
				tags: ['security']
			};

			await store.startAgentActionByProject('/projects/test', action, 'codex');

			expect(mockIntegrationApprovalStore.ensureIntegration).toHaveBeenCalledWith('codex');
			expect(mockWorkspaceStore.addAIByProject).toHaveBeenCalledWith(
				{ path: '/projects/test', name: 'Test' },
				'codex',
				{
					label: 'Security Scan',
					prompt: 'Scan this codebase for security issues'
				}
			);
		});

		it('starts nothing when the integration is declined', async () => {
			(
				mockIntegrationApprovalStore.ensureIntegration as ReturnType<typeof vi.fn>
			).mockResolvedValue(false);
			const action = { name: 'Scan', prompt: 'Scan' } as AgentAction;

			await store.startAgentActionByProject('/projects/test', action, 'claude');
			await store.startAgentActionInWorkspace({ id: 'ws-1' }, action, 'claude');

			expect(mockWorkspaceStore.addAIByProject).not.toHaveBeenCalled();
			expect(mockWorkspaceStore.addAISession).not.toHaveBeenCalled();
		});
	});

	describe('startAgentActionInWorkspace', () => {
		it('starts a claude session with action label and prompt', async () => {
			const action: AgentAction = {
				id: 'action-1',
				name: 'Review PR',
				prompt: 'Review this PR for regressions',
				target: 'both',
				category: 'Code Review',
				tags: ['review']
			};

			await store.startAgentActionInWorkspace({ id: 'ws-1' }, action, 'claude');

			expect(mockIntegrationApprovalStore.ensureIntegration).toHaveBeenCalledWith('claude');
			expect(mockWorkspaceStore.addAISession).toHaveBeenCalledWith('ws-1', 'claude', {
				label: 'Review PR',
				prompt: 'Review this PR for regressions'
			});
		});
	});

	describe('syncLabelFromSession (via events)', () => {
		function setupCodexPane() {
			(mockWorkspaceStore as { workspaces: unknown[] }).workspaces = [
				{
					id: 'ws-1',
					projectPath: '/test',
					projectName: 'Test',
					terminalTabs: [
						{
							id: 'tab-1',
							label: 'Codex 1',
							split: 'horizontal',
							type: 'codex',
							panes: [{ id: 'pane-1', type: 'codex' }]
						}
					],
					activeTerminalTabId: 'tab-1'
				}
			];
		}

		it('Codex notify metadata and the shared attention event raise one completion alert', () => {
			setupCodexPane();
			const alert = vi.fn();
			store.onAttention(alert);
			(mockWorkspaceStore.pane as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'pane-1' });
			emitMockEvent('codex:notify', {
				paneId: 'pane-1',
				sessionId: 'thread',
				notifyEvent: 'agent-turn-complete'
			});
			expect(alert).not.toHaveBeenCalled();
			emitMockEvent('agent:attention', {
				kind: 'turnEnded',
				agent: 'codex',
				sessionId: 'thread',
				paneId: 'pane-1',
				terminalOnly: true
			});
			expect(alert).toHaveBeenCalledTimes(1);
		});

		it('codex:notify with sessionId sets fallback label then resolves to discovered label', async () => {
			setupCodexPane();

			const sessions: DiscoveredClaudeSession[] = [
				{ sessionId: 'codex-sess-1', label: 'Fix auth bug', timestamp: '2025-01-01T00:00:00Z' }
			];
			mockInvoke('discover_codex_sessions', () => sessions);

			(mockWorkspaceStore.findAIPaneContext as ReturnType<typeof vi.fn>).mockReturnValue({
				projectPath: '/test',
				cwd: '/test'
			});

			emitMockEvent('codex:notify', {
				paneId: 'pane-1',
				sessionId: 'codex-sess-1'
			});

			await vi.waitFor(() => {
				expect(mockWorkspaceStore.renameTab).toHaveBeenCalledWith('tab-1', 'Fix auth bug');
			});
		});

		it('stale-session guard: does not update label if session changed before discover returns', async () => {
			setupCodexPane();

			let resolveDiscover!: (sessions: DiscoveredClaudeSession[]) => void;
			mockInvoke(
				'discover_codex_sessions',
				() =>
					new Promise<DiscoveredClaudeSession[]>((r) => {
						resolveDiscover = r;
					})
			);

			(mockWorkspaceStore.findAIPaneContext as ReturnType<typeof vi.fn>).mockReturnValue({
				projectPath: '/test',
				cwd: '/test'
			});

			// First session event
			emitMockEvent('codex:notify', {
				paneId: 'pane-1',
				sessionId: 'session-old'
			});

			// Second session event (supersedes the first)
			emitMockEvent('codex:notify', {
				paneId: 'pane-1',
				sessionId: 'session-new'
			});

			// Now resolve the first discover call — should be ignored because latest is session-new
			resolveDiscover([
				{ sessionId: 'session-old', label: 'Stale label', timestamp: '2025-01-01T00:00:00Z' }
			]);
			await new Promise((r) => setTimeout(r, 0));

			expect(mockWorkspaceStore.renameTab).not.toHaveBeenCalled();
		});

		it('keeps the label when discover returns no matching session', async () => {
			setupCodexPane();

			mockInvoke('discover_codex_sessions', () => [
				{
					sessionId: 'other-session',
					label: 'Other session',
					timestamp: '2025-01-01T00:00:00Z'
				}
			]);

			(mockWorkspaceStore.findAIPaneContext as ReturnType<typeof vi.fn>).mockReturnValue({
				projectPath: '/test',
				cwd: '/test'
			});

			emitMockEvent('codex:notify', {
				paneId: 'pane-1',
				sessionId: 'my-session'
			});

			await new Promise((r) => setTimeout(r, 0));

			expect(mockWorkspaceStore.renameTab).not.toHaveBeenCalled();
		});
	});
});
