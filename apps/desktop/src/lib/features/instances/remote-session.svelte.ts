import type { ControlPlaneTransport } from '@workbench/transport';
import type { ControlPlaneStore, SessionCounts } from '@workbench/control-plane-ui';
import type {
	ClaudeAccount,
	ProjectConfig,
	WorkbenchSettings,
	WorktreeInfo
} from '$types/workbench';
import { defaultAccountName } from '$types/accounts';
import { workbenchServer, type WorkbenchServer } from '$features/chat/agent-api';
import { releaseChat } from '$features/chat/chat-registry.svelte';
import { ClaudeSessionStore } from '$stores/claudeSessions.svelte';
import { getWorkbenchSettingsStore } from '$stores/context';
import type { WorkbenchSettingsStore } from '$stores/workbench-settings.svelte';
import { WorkspaceStore } from '$stores/workspaces.svelte';
import type { RemoteInstance } from './instances.svelte';

/** This machine's settings a remote's workspaces still read (fonts, default views). */
export interface RemoteSessionDeps {
	settings: WorkbenchSettingsStore;
}

/** The instance's workspaces. Call during component init: it reads this machine's settings from context. */
export function remoteSession(instance: RemoteInstance): RemoteSession {
	return instance.session({ settings: getWorkbenchSettingsStore() });
}

/**
 * A remote server's workspaces, rendered by the same views as the local ones:
 * its own workspace and session stores, and the server its terminals and
 * chats attach to. Every process runs on that server. It follows the server's
 * snapshots from creation until `dispose`, so its chats are released as panes
 * close even while another instance is shown.
 */
export class RemoteSession {
	readonly server: WorkbenchServer;
	readonly workspaces: WorkspaceStore;
	readonly sessions: ClaudeSessionStore;
	/** The host's Claude logins: a chat switches to one of these, never this machine's. */
	claudeAccounts = $state<ClaudeAccount[]>([]);
	defaultAccountName = $state(defaultAccountName(null));
	/** Running Claude and Codex sessions by project path. */
	readonly sessionCounts: Record<string, SessionCounts>;
	private readonly uiKey: string;

	private readonly transport: ControlPlaneTransport;
	private readonly control: Pick<ControlPlaneStore, 'projects'>;

	constructor(
		id: string,
		address: { baseUrl: string; token?: string },
		transport: ControlPlaneTransport,
		control: Pick<ControlPlaneStore, 'projects'>,
		deps: RemoteSessionDeps
	) {
		this.transport = transport;
		this.control = control;
		this.uiKey = `workbench.workspace-ui.${id}`;
		this.server = { ...workbenchServer(id, async () => address, true), accounts: this };
		this.workspaces = new WorkspaceStore(transport, {
			uiKey: this.uiKey,
			remote: true,
			settings: deps.settings,
			// This machine's git state says nothing about the host's paths.
			git: { statusByProject: {}, branchByProject: {} }
		});
		this.sessions = new ClaudeSessionStore(
			this.workspaces,
			this,
			// The host installs its own agent integrations.
			{ ensureIntegration: async () => true },
			transport,
			false
		);
		this.sessionCounts = $derived(
			Object.fromEntries(
				Object.entries(this.sessions.activeSessionsByProject).map(([path, list]) => [
					path,
					{
						claude: list.filter((s) => s.sessionType === 'claude').length,
						codex: list.filter((s) => s.sessionType === 'codex').length
					}
				])
			)
		);
		void this.workspaces.load();
		void this.loadAccounts();
	}

	private async loadAccounts(): Promise<void> {
		try {
			const settings = (await this.transport.invoke(
				'load_workbench_settings',
				undefined
			)) as WorkbenchSettings;
			this.claudeAccounts = settings.claudeAccounts ?? [];
			this.defaultAccountName = defaultAccountName(settings);
		} catch {
			/* An unreachable host keeps its default account only. */
		}
	}

	/** The server's project, or one named after the workspace when its list hasn't caught up. */
	getByPath(path: string): ProjectConfig | undefined {
		return this.control.projects.find((p) => p.path === path);
	}

	projectFor(ws: { projectPath: string; projectName: string }): ProjectConfig {
		return this.getByPath(ws.projectPath) ?? { name: ws.projectName, path: ws.projectPath };
	}

	/** Show the workspace for the project (or its worktree), opening it on the host if need be. */
	open(project: ProjectConfig, worktree?: WorktreeInfo): Promise<unknown> {
		const ws = worktree
			? this.workspaces.getByWorktreePath(worktree.path)
			: this.workspaces.getByProjectPath(project.path);
		if (ws) {
			this.workspaces.selectedId = ws.id;
			return Promise.resolve(null);
		}
		return worktree
			? this.workspaces.openWorktree(project, worktree.path, worktree.branch)
			: this.workspaces.open(project);
	}

	/** The server was removed: stop following it and forget this device's state for it. */
	dispose(): void {
		this.workspaces.dispose();
		for (const ws of this.workspaces.workspaces)
			for (const tab of ws.terminalTabs) for (const pane of tab.panes) releaseChat(pane.id);
		try {
			localStorage.removeItem(this.uiKey);
		} catch {
			/* blocked storage holds nothing to forget */
		}
	}
}
