import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	invokeSpy,
	mockInvoke,
	clearInvokeMocks,
	emitMockEvent,
	clearListeners,
	listenSpy
} from '../../test/tauri-mocks';
import { TrelloStore } from './trello.svelte';
import type { WorkspaceStore } from './workspaces.svelte';
import type { GitStore } from './git.svelte';
import type { GitHubStore } from './github.svelte';
import type { BoardConfig, TrelloBoardData } from '$types/trello';

// Mock stores
const mockWorkspaceStore = {
	activeWorkspace: null as { projectPath: string; worktreePath?: string; branch?: string } | null,
	resolvedBranch: vi.fn()
} as unknown as WorkspaceStore;

const mockGitStore = {} as unknown as GitStore;
const mockGitHubStore = {} as unknown as GitHubStore;

vi.mock('./context', () => ({
	getWorkspaceStore: () => mockWorkspaceStore,
	getGitStore: () => mockGitStore,
	getGitHubStore: () => mockGitHubStore
}));

describe('TrelloStore', () => {
	let store: TrelloStore;

	beforeEach(() => {
		(mockWorkspaceStore as unknown as Record<string, unknown>).activeWorkspace = null;
		vi.mocked(mockWorkspaceStore.resolvedBranch).mockReturnValue(undefined);
		store = new TrelloStore();
	});

	afterEach(() => {
		clearInvokeMocks();
		clearListeners();
	});

	// --- Credential lifecycle ---

	describe('loadCredentials', () => {
		it('sets authenticated to true when credentials exist', async () => {
			mockInvoke('trello_load_credentials', () => ({
				apiKey: 'key-1',
				token: 'tok-1'
			}));

			await store.loadCredentials();

			expect(store.credentials).toEqual({ apiKey: 'key-1', token: 'tok-1' });
			expect(store.authenticated).toBe(true);
		});

		it('sets authenticated to false when credentials are null', async () => {
			mockInvoke('trello_load_credentials', () => null);

			await store.loadCredentials();

			expect(store.credentials).toBeNull();
			expect(store.authenticated).toBe(false);
		});

		it('handles invoke failure gracefully', async () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			mockInvoke('trello_load_credentials', () => {
				throw new Error('file not found');
			});

			await store.loadCredentials();

			expect(store.credentials).toBeNull();
			expect(store.authenticated).toBe(false);
			expect(warnSpy).toHaveBeenCalledWith(
				'[TrelloStore] Failed to load credentials:',
				expect.any(Error)
			);
			warnSpy.mockRestore();
		});
	});

	describe('disconnect', () => {
		it('clears all state and invokes disconnect', async () => {
			// Pre-populate state
			store.credentials = { apiKey: 'k', token: 't' };
			store.availableBoards = [{ id: 'b1', name: 'Board 1', url: '' }];
			store.boardDataCache = { key: { board: { id: 'b1', name: 'B', url: '' }, columns: [] } };

			await store.disconnect();

			expect(invokeSpy).toHaveBeenCalledWith('trello_disconnect');
			expect(store.credentials).toBeNull();
			expect(store.authenticated).toBe(false);
			expect(store.availableBoards).toEqual([]);
			expect(store.boardDataCache).toEqual({});
		});
	});

	// --- Task link/unlink ---

	describe('linkTaskToBranch', () => {
		it('asks the host to link the card and keeps the config it answers with', async () => {
			const saved = { boards: [], taskLinks: [{ cardId: 'card-0' }, { cardId: 'card-1' }] };
			mockInvoke('trello_set_task_link', () => saved);

			await store.linkTaskToBranch('/proj', 'card-1', 'board-1', 'feature-x');

			expect(invokeSpy).toHaveBeenCalledWith('trello_set_task_link', {
				projectPath: '/proj',
				cardId: 'card-1',
				link: {
					cardId: 'card-1',
					boardId: 'board-1',
					branch: 'feature-x',
					worktreePath: undefined,
					projectPath: '/proj'
				}
			});
			expect(store.configByProject['/proj']).toEqual(saved);
		});

		it('executes the link action of the board in the saved config', async () => {
			const linkAction = { moveToColumnId: 'col-wip', addLabelIds: [], removeLabelIds: [] };
			mockInvoke('trello_set_task_link', () => ({
				boards: [{ boardId: 'board-1', boardName: 'B', hiddenColumns: [], linkAction }],
				taskLinks: []
			}));

			await store.linkTaskToBranch('/proj', 'card-1', 'board-1', 'feat');

			expect(invokeSpy).toHaveBeenCalledWith('trello_move_card', {
				cardId: 'card-1',
				targetListId: 'col-wip'
			});
		});

		it('skips the link action when the link could not be saved', async () => {
			mockInvoke('trello_set_task_link', () => Promise.reject(new Error('disk full')));

			await store.linkTaskToBranch('/proj', 'card-1', 'board-1', 'feat');

			expect(invokeSpy).not.toHaveBeenCalledWith('trello_move_card', expect.anything());
		});
	});

	describe('unlinkTask', () => {
		it('asks the host to drop the card link', async () => {
			mockInvoke('trello_set_task_link', () => ({ boards: [], taskLinks: [] }));

			await store.unlinkTask('/proj', 'card-1');

			expect(invokeSpy).toHaveBeenCalledWith('trello_set_task_link', {
				projectPath: '/proj',
				cardId: 'card-1',
				link: null
			});
		});
	});

	describe('board writes', () => {
		const board = (hiddenColumns: string[] = []) => ({
			boardId: 'b1',
			boardName: 'B',
			hiddenColumns
		});

		it('adds a single board, so an unloaded config cannot drop the others', async () => {
			mockInvoke('trello_put_board', () => ({ boards: [board()], taskLinks: [] }));

			await store.addBoard('/proj', board());

			expect(invokeSpy).toHaveBeenCalledWith('trello_put_board', {
				projectPath: '/proj',
				board: board(),
				keepExisting: true
			});
		});

		it('runs quick edits one after another, each from the last saved board', async () => {
			store.configByProject = { '/proj': { boards: [board()], taskLinks: [] } };
			mockInvoke('trello_put_board', (args) => ({
				boards: [(args as { board: ReturnType<typeof board> }).board],
				taskLinks: []
			}));
			const hide = (col: string) =>
				store.editBoard('/proj', 'b1', (b) => ({ ...b, hiddenColumns: [...b.hiddenColumns, col] }));

			await Promise.all([hide('a'), hide('b')]);

			expect(store.configByProject['/proj'].boards[0].hiddenColumns).toEqual(['a', 'b']);
		});
	});

	describe('trello:merge-action-applied events', () => {
		it('registers a trello merge action listener', () => {
			expect(listenSpy).toHaveBeenCalledWith('trello:merge-action-applied', expect.any(Function));
		});

		it('refreshes board data when merge action is applied', () => {
			const refreshSpy = vi.spyOn(store, 'refreshAllBoards').mockResolvedValue();
			emitMockEvent('trello:merge-action-applied', {
				projectPath: '/proj',
				branch: 'feature/x',
				cardId: 'card-1'
			});
			expect(refreshSpy).toHaveBeenCalledWith('/proj');
		});
	});

	// --- Derived state ---

	describe('derived: activeBoards', () => {
		it('returns boards for active project', () => {
			const boards: BoardConfig[] = [{ boardId: 'b1', boardName: 'Board 1', hiddenColumns: [] }];
			store.configByProject = { '/proj': { boards, taskLinks: [] } };
			(mockWorkspaceStore as unknown as Record<string, unknown>).activeWorkspace = {
				projectPath: '/proj'
			};

			expect(store.activeBoards).toEqual(boards);
		});

		it('returns empty array when no active workspace', () => {
			(mockWorkspaceStore as unknown as Record<string, unknown>).activeWorkspace = null;

			expect(store.activeBoards).toEqual([]);
		});
	});

	describe('derived: linkedTask', () => {
		it('returns task link matching active branch', () => {
			const link = {
				cardId: 'card-1',
				boardId: 'b1',
				branch: 'feat-x',
				projectPath: '/proj'
			};
			store.configByProject = { '/proj': { boards: [], taskLinks: [link] } };
			(mockWorkspaceStore as unknown as Record<string, unknown>).activeWorkspace = {
				projectPath: '/proj'
			};
			vi.mocked(mockWorkspaceStore.resolvedBranch).mockReturnValue('feat-x');

			expect(store.linkedTask).toEqual(link);
		});

		it('returns null when no branch matches', () => {
			store.configByProject = {
				'/proj': {
					boards: [],
					taskLinks: [{ cardId: 'card-1', boardId: 'b1', branch: 'other', projectPath: '/proj' }]
				}
			};
			(mockWorkspaceStore as unknown as Record<string, unknown>).activeWorkspace = {
				projectPath: '/proj'
			};
			vi.mocked(mockWorkspaceStore.resolvedBranch).mockReturnValue('feat-x');

			expect(store.linkedTask).toBeNull();
		});
	});

	describe('derived: activeBoardData', () => {
		it('returns board data for active boards', () => {
			const boardData: TrelloBoardData = {
				board: { id: 'b1', name: 'Board 1', url: '' },
				columns: []
			};
			store.configByProject = {
				'/proj': {
					boards: [{ boardId: 'b1', boardName: 'Board 1', hiddenColumns: [] }],
					taskLinks: []
				}
			};
			store.boardDataCache = { '/proj::b1': boardData };
			(mockWorkspaceStore as unknown as Record<string, unknown>).activeWorkspace = {
				projectPath: '/proj'
			};

			expect(store.activeBoardData).toEqual([boardData]);
		});

		it('filters out boards without cached data', () => {
			store.configByProject = {
				'/proj': {
					boards: [
						{ boardId: 'b1', boardName: 'Board 1', hiddenColumns: [] },
						{ boardId: 'b2', boardName: 'Board 2', hiddenColumns: [] }
					],
					taskLinks: []
				}
			};
			const boardData: TrelloBoardData = {
				board: { id: 'b1', name: 'Board 1', url: '' },
				columns: []
			};
			store.boardDataCache = { '/proj::b1': boardData };
			(mockWorkspaceStore as unknown as Record<string, unknown>).activeWorkspace = {
				projectPath: '/proj'
			};

			expect(store.activeBoardData).toEqual([boardData]);
		});
	});
});
