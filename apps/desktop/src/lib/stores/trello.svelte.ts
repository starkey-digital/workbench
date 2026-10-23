import type {
	BoardConfig,
	MergeAction,
	TaskLink,
	TrelloBoard,
	TrelloBoardData,
	TrelloCard,
	TrelloCredentials,
	TrelloProjectConfig
} from '$types/trello';
import type { TrelloMergeActionAppliedEvent } from '$types/workbench';
import type { WorkspaceStore } from './workspaces.svelte';
import { getWorkspaceStore } from './context';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'svelte-sonner';
import { emit, listen } from '@tauri-apps/api/event';
import { log } from '$lib/log';

/**
 * The settings OS window instantiates TrelloStore without a WorkspaceStore in
 * context — it only needs credentials + project config, and gets its project
 * path from the query string. Returning null there keeps construction from
 * throwing `missing_context` (which would blank the whole window).
 */
function tryGetWorkspaceStore(): WorkspaceStore | null {
	try {
		return getWorkspaceStore();
	} catch {
		return null;
	}
}

/** A window saved a project's Trello config. */
const CONFIG_CHANGED = 'trello:config-changed';

interface ConfigChange {
	source: string;
	projectPath: string;
	config: TrelloProjectConfig;
}

export class TrelloStore {
	// --- State ---
	credentials: TrelloCredentials | null = $state(null);
	readonly authenticated = $derived(this.credentials != null);
	configByProject: Record<string, TrelloProjectConfig> = $state({});
	boardDataCache: Record<string, TrelloBoardData> = $state({});
	availableBoards: TrelloBoard[] = $state([]);
	loading = $state(false);

	// Private refs to other stores. Null in the settings window (no WorkspaceStore
	// in context there); the settings UI takes its project path from the query string.
	private workspaces = tryGetWorkspaceStore();
	private windowId = crypto.randomUUID();

	constructor() {
		// Another window's write: its result, so no read here can race a newer save.
		listen<ConfigChange>(CONFIG_CHANGED, ({ payload }) => {
			if (payload.source === this.windowId) return;
			this.configByProject = { ...this.configByProject, [payload.projectPath]: payload.config };
		}).catch((e) => log.warn('TrelloStore', 'Failed to listen for config changes:', e));
		listen<TrelloMergeActionAppliedEvent>('trello:merge-action-applied', (event) => {
			void this.refreshAllBoards(event.payload.projectPath);
		});
	}

	// --- Derived ---
	readonly activeProjectPath = $derived(this.workspaces?.activeWorkspace?.projectPath ?? null);

	readonly activeBoards = $derived.by((): BoardConfig[] => {
		const pp = this.activeProjectPath;
		if (!pp) return [];
		return this.configByProject[pp]?.boards ?? [];
	});

	readonly activeTaskLinks = $derived.by((): TaskLink[] => {
		const pp = this.activeProjectPath;
		if (!pp) return [];
		return this.configByProject[pp]?.taskLinks ?? [];
	});

	readonly activeBranch = $derived.by((): string | null => {
		const ws = this.workspaces?.activeWorkspace;
		if (!ws) return null;
		return this.workspaces?.resolvedBranch(ws) ?? null;
	});

	readonly linkedTask = $derived.by((): TaskLink | null => {
		const branch = this.activeBranch;
		if (!branch) return null;
		return this.activeTaskLinks.find((t) => t.branch === branch) ?? null;
	});

	readonly activeBoardData = $derived.by((): TrelloBoardData[] => {
		const pp = this.activeProjectPath;
		if (!pp) return [];
		const boards = this.configByProject[pp]?.boards ?? [];
		return boards
			.map((b) => this.boardDataCache[`${pp}::${b.boardId}`])
			.filter((d): d is TrelloBoardData => d != null);
	});

	// --- Methods ---

	async loadCredentials(): Promise<void> {
		try {
			const creds = await invoke<TrelloCredentials | null>('trello_load_credentials');
			this.credentials = creds;
		} catch (e) {
			log.warn('TrelloStore', 'Failed to load credentials:', e);
		}
	}

	async saveCredentials(apiKey: string, token: string): Promise<void> {
		await invoke('trello_save_credentials', { apiKey, token });
		this.credentials = { apiKey, token };
	}

	async validateAuth(apiKey: string, token: string): Promise<boolean> {
		return invoke<boolean>('trello_validate_auth', { apiKey, token });
	}

	async disconnect(): Promise<void> {
		await invoke('trello_disconnect');
		this.credentials = null;
		this.availableBoards = [];
		this.boardDataCache = {};
	}

	async loadProjectConfig(projectPath: string): Promise<void> {
		try {
			const config = await invoke<TrelloProjectConfig>('trello_load_project_config', {
				projectPath
			});
			this.configByProject = { ...this.configByProject, [projectPath]: config };
		} catch (e) {
			log.warn('TrelloStore', 'Failed to load project config:', e);
		}
	}

	/**
	 * The host writes one board or one link at a time, under one lock, so the
	 * settings window's board edits and this window's links can't drop each
	 * other; each write's result goes to every other window.
	 *
	 * `edit` gets the saved board (as last written) and returns its new state;
	 * edits run one after another, each from the previous one's result.
	 */
	editBoard(projectPath: string, boardId: string, edit: (board: BoardConfig) => BoardConfig) {
		return this.queueBoardWrite(async () => {
			const board = this.configByProject[projectPath]?.boards.find((b) => b.boardId === boardId);
			if (!board) return;
			this.applySaved(
				projectPath,
				await invoke<TrelloProjectConfig>('trello_put_board', {
					projectPath,
					board: edit(board),
					keepExisting: false
				})
			);
		});
	}

	/** Add a board; one already saved keeps its settings. */
	addBoard(projectPath: string, board: BoardConfig) {
		return this.queueBoardWrite(async () =>
			this.applySaved(
				projectPath,
				await invoke<TrelloProjectConfig>('trello_put_board', {
					projectPath,
					board,
					keepExisting: true
				})
			)
		);
	}

	removeBoard(projectPath: string, boardId: string) {
		return this.queueBoardWrite(async () =>
			this.applySaved(
				projectPath,
				await invoke<TrelloProjectConfig>('trello_remove_board', { projectPath, boardId })
			)
		);
	}

	private boardWrites: Promise<unknown> = Promise.resolve();

	private queueBoardWrite(write: () => Promise<void>): Promise<void> {
		const next = this.boardWrites.catch(() => {}).then(write);
		this.boardWrites = next;
		return next;
	}

	private async setTaskLink(projectPath: string, cardId: string, link: TaskLink | null) {
		const config = await invoke<TrelloProjectConfig>('trello_set_task_link', {
			projectPath,
			cardId,
			link
		});
		this.applySaved(projectPath, config);
		return config;
	}

	private applySaved(projectPath: string, config: TrelloProjectConfig) {
		this.configByProject = { ...this.configByProject, [projectPath]: config };
		const change: ConfigChange = { source: this.windowId, projectPath, config };
		void emit(CONFIG_CHANGED, change).catch(() => {});
	}

	async fetchAvailableBoards(): Promise<void> {
		if (!this.credentials) return;
		this.loading = true;
		try {
			this.availableBoards = await invoke<TrelloBoard[]>('trello_list_boards', {
				apiKey: this.credentials.apiKey,
				token: this.credentials.token
			});
		} catch (e) {
			log.warn('TrelloStore', 'Failed to fetch boards:', e);
			this.availableBoards = [];
		} finally {
			this.loading = false;
		}
	}

	async fetchBoardData(projectPath: string, boardConfig: BoardConfig): Promise<void> {
		try {
			const data = await invoke<TrelloBoardData>('trello_fetch_board_data', {
				boardId: boardConfig.boardId,
				hiddenColumns: boardConfig.hiddenColumns
			});
			const key = `${projectPath}::${boardConfig.boardId}`;
			this.boardDataCache = { ...this.boardDataCache, [key]: data };
		} catch (e) {
			log.warn('TrelloStore', 'Failed to fetch board data:', e);
		}
	}

	async refreshAllBoards(projectPath: string): Promise<void> {
		const boards = this.configByProject[projectPath]?.boards ?? [];
		await Promise.all(boards.map((b) => this.fetchBoardData(projectPath, b)));
	}

	async createCard(projectPath: string, listId: string, name: string): Promise<TrelloCard | null> {
		try {
			const card = await invoke<TrelloCard>('trello_create_card', { listId, name });
			await this.refreshAllBoards(projectPath);
			return card;
		} catch (e) {
			log.warn('TrelloStore', 'Failed to create card:', e);
			return null;
		}
	}

	async moveCard(cardId: string, targetListId: string): Promise<void> {
		await invoke('trello_move_card', { cardId, targetListId });
	}

	async addLabel(cardId: string, labelId: string): Promise<void> {
		await invoke('trello_add_label', { cardId, labelId });
	}

	async removeLabel(cardId: string, labelId: string): Promise<void> {
		await invoke('trello_remove_label', { cardId, labelId });
	}

	async linkTaskToBranch(
		projectPath: string,
		cardId: string,
		boardId: string,
		branch: string,
		worktreePath?: string
	): Promise<void> {
		const link: TaskLink = { cardId, boardId, branch, worktreePath, projectPath };
		let config: TrelloProjectConfig;
		try {
			config = await this.setTaskLink(projectPath, cardId, link);
		} catch (e) {
			log.warn('TrelloStore', 'Failed to link task:', e);
			toast.error(`Couldn't link the Trello card: ${String(e)}`);
			return;
		}

		// Execute link action if configured
		const board = config.boards.find((b) => b.boardId === boardId);
		if (board?.linkAction) {
			await this.executeBoardAction(cardId, board.linkAction, projectPath);
		}
	}

	async unlinkTask(projectPath: string, cardId: string): Promise<void> {
		try {
			await this.setTaskLink(projectPath, cardId, null);
		} catch (e) {
			log.warn('TrelloStore', 'Failed to unlink task:', e);
			toast.error(`Couldn't unlink the Trello card: ${String(e)}`);
		}
	}

	private async executeBoardAction(
		cardId: string,
		action: MergeAction,
		projectPath: string
	): Promise<void> {
		try {
			if (action.moveToColumnId) {
				await this.moveCard(cardId, action.moveToColumnId);
			}
			await Promise.all([
				...(action.addLabelIds ?? []).map((id) => this.addLabel(cardId, id)),
				...(action.removeLabelIds ?? []).map((id) => this.removeLabel(cardId, id))
			]);
			await this.refreshAllBoards(projectPath);
		} catch (e) {
			log.error('TrelloStore', 'Board action failed:', e);
		}
	}
}
