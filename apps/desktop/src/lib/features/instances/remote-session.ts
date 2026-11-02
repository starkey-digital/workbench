import type { ControlPlaneTransport } from '@workbench/transport';
import type { ProjectConfig } from '$types/workbench';
import type { ControlPlaneStore } from '@workbench/control-plane-ui';
import { workbenchServer, type WorkbenchServer } from '$features/chat/agent-api';
import { ClaudeSessionStore } from '$stores/claudeSessions.svelte';
import type { GitStore } from '$stores/git.svelte';
import type { WorkbenchSettingsStore } from '$stores/workbench-settings.svelte';
import { WorkspaceStore } from '$stores/workspaces.svelte';
import { getGitStore, getWorkbenchSettingsStore } from '$stores/context';
import type { RemoteInstance } from './instances.svelte';

/** The instance's workspaces. Call during component init: it reads this machine's stores from context. */
export function remoteSession(instance: RemoteInstance): RemoteSession {
	return instance.session({ settings: getWorkbenchSettingsStore(), git: getGitStore() });
}

/** This machine's stores a remote's workspaces still read (fonts, default views). */
export interface RemoteSessionDeps {
	settings: WorkbenchSettingsStore;
	git: GitStore;
}

/**
 * A remote server's workspaces, rendered by the same views as the local ones:
 * its own workspace and session stores, and the server its terminals and
 * chats attach to. Every process runs on that server.
 */
export class RemoteSession {
	readonly server: WorkbenchServer;
	readonly workspaces: WorkspaceStore;
	readonly sessions: ClaudeSessionStore;

	constructor(
		id: string,
		address: { baseUrl: string; token?: string },
		transport: ControlPlaneTransport,
		private readonly control: ControlPlaneStore,
		deps: RemoteSessionDeps
	) {
		this.server = workbenchServer(id, async () => address, true);
		this.workspaces = new WorkspaceStore(transport, {
			uiKey: `workbench.workspace-ui.${id}`,
			remote: true,
			...deps
		});
		this.sessions = new ClaudeSessionStore(
			this.workspaces,
			this,
			// The host installs its own agent integrations.
			{ ensureIntegration: async () => true },
			transport
		);
	}

	/** The server's project, or one named after the workspace when its list hasn't caught up. */
	getByPath(path: string): ProjectConfig | undefined {
		return this.control.projects.find((p) => p.path === path);
	}

	projectFor(ws: { projectPath: string; projectName: string }): ProjectConfig {
		return this.getByPath(ws.projectPath) ?? { name: ws.projectName, path: ws.projectPath };
	}
}
