import { invoke } from '@tauri-apps/api/core';
import type { RemoteInstance } from '$features/instances/instances.svelte';
import type { ProjectConfig, ProjectCopy } from '$types/workbench';

/** The "Copy to Server" dialog: which project, where to, and how it went. */
export class CopyProjectFlow {
	open = $state(false);
	project = $state<ProjectConfig | null>(null);
	serverId = $state('');
	/** Blank: the server's clone folder, else its home. */
	parent = $state('');
	claudeConfig = $state(false);
	claudeAccounts = $state(false);
	copying = $state(false);
	error = $state('');
	result = $state<ProjectCopy | null>(null);

	start(project: ProjectConfig, remotes: RemoteInstance[]) {
		this.project = project;
		this.serverId = (remotes.find((r) => r.status === 'online') ?? remotes[0])?.config.id ?? '';
		this.parent = '';
		this.claudeConfig = false;
		this.claudeAccounts = false;
		this.error = '';
		this.result = null;
		this.open = true;
	}

	async copy(remotes: RemoteInstance[]) {
		const remote = remotes.find((r) => r.config.id === this.serverId);
		if (!this.project || !remote || this.copying) return;
		this.copying = true;
		this.error = '';
		try {
			this.result = await invoke<ProjectCopy>('copy_project_to_server', {
				serverUrl: remote.base,
				token: remote.config.token ?? null,
				projectPath: this.project.path,
				projectName: this.project.name,
				parent: this.parent.trim() || null,
				claudeConfig: this.claudeConfig,
				claudeAccounts: this.claudeAccounts
			});
			void remote.store.refresh();
		} catch (e) {
			this.error = String(e);
		} finally {
			this.copying = false;
		}
	}
}
