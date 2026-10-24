import type { ControlPlaneTransport } from '@workbench/transport';
import type { FolderListing, ProjectConfig, ProjectEdit, WorktreeInfo } from '@workbench/types';

/**
 * Transport-driven control-plane state for the shared sidebar. Works against any
 * {@link ControlPlaneTransport} — the desktop app's local Tauri transport or a
 * remote `workbench-server` over HTTP. Covers the operations a remote client
 * needs: list, add, edit and remove projects, view/create worktrees and their
 * GitHub links. No terminal IO.
 */
export class ControlPlaneStore {
	private transport: ControlPlaneTransport;

	projects = $state<ProjectConfig[]>([]);
	/** Worktrees per project path, loaded on demand. */
	worktrees = $state<Record<string, WorktreeInfo[]>>({});
	/** GitHub web URL per project path (null when it has none), loaded on demand. */
	githubUrls = $state<Record<string, string | null>>({});
	loading = $state(false);
	error = $state<string | null>(null);

	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal bookkeeping only
	private githubUrlsInFlight = new Set<string>();
	/** Calls started so far, and how many had started when `error` was set. */
	private runs = 0;
	private errorAt = 0;

	constructor(transport: ControlPlaneTransport) {
		this.transport = transport;
	}

	/** Only a call started after the last failure clears it, so a concurrent success can't hide it. */
	private async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
		const run = ++this.runs;
		try {
			const result = await fn();
			if (run > this.errorAt) this.error = null;
			return result;
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			this.errorAt = this.runs;
			return undefined;
		}
	}

	async refresh() {
		this.loading = true;
		await Promise.all([
			this.loadProjects(),
			...Object.keys(this.githubUrls).map((path) => this.fetchGithubUrl(path))
		]);
		this.loading = false;
	}

	async loadProjects() {
		const projects = await this.run(() => this.transport.invoke('list_projects', undefined));
		if (projects) this.projects = projects;
	}

	/** The project edits throw, so the form that sent one can show why it failed. */
	async addProject(edit: ProjectEdit): Promise<ProjectConfig> {
		const project = await this.transport.invoke('add_project', { edit });
		this.projects = [...this.projects, project];
		return project;
	}

	async updateProject(edit: ProjectEdit): Promise<ProjectConfig> {
		const project = await this.transport.invoke('update_project', { edit });
		this.projects = this.projects.map((p) => (p.path === project.path ? project : p));
		return project;
	}

	async removeProject(path: string): Promise<void> {
		await this.transport.invoke('remove_project', { path });
		this.projects = this.projects.filter((p) => p.path !== path);
	}

	/** The subfolders of `path` on the server's machine (its home folder when absent). */
	listFolders(path?: string): Promise<FolderListing> {
		return this.transport.invoke('list_folders', path ? { path } : {});
	}

	async loadWorktrees(projectPath: string) {
		const list = await this.run(() =>
			this.transport.invoke('list_worktrees', { path: projectPath })
		);
		if (list) this.worktrees = { ...this.worktrees, [projectPath]: list };
	}

	/** Loads once per path; `refresh()` re-fetches the loaded ones. */
	async loadGithubUrl(projectPath: string) {
		if (!(projectPath in this.githubUrls)) await this.fetchGithubUrl(projectPath);
	}

	/** Best-effort, so it never sets `error`: a failed request keeps what was cached
	 *  (nothing, the first time) and a later call retries. */
	private async fetchGithubUrl(projectPath: string) {
		if (this.githubUrlsInFlight.has(projectPath)) return;
		this.githubUrlsInFlight.add(projectPath);
		try {
			const remote = await this.transport.invoke('github_get_remote', { path: projectPath });
			this.githubUrls = { ...this.githubUrls, [projectPath]: remote?.htmlUrl ?? null };
		} catch {
			// Unreachable server: keep the cached value.
		} finally {
			this.githubUrlsInFlight.delete(projectPath);
		}
	}

	async createWorktree(projectPath: string, branch: string) {
		const result = await this.run(() =>
			this.transport.invoke('create_worktree', {
				request: { repoPath: projectPath, branch, newBranch: true }
			})
		);
		if (result !== undefined) await this.loadWorktrees(projectPath);
		return result;
	}
}
