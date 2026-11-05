import type { GitHubRepo, ProjectConfig } from '@workbench/types';
import type { ControlPlaneStore } from './control-plane.svelte.ts';
import { FolderBrowser } from './folder-browser.svelte.ts';
import { pathKey } from './path-key.ts';
import { repoUrl } from './repo-url.ts';

export type NewProjectMode = 'folder' | 'clone';

/**
 * "New project" on a remote server: browse its folders, then add the one shown,
 * make a new one inside it, or clone a repository into it.
 */
export class NewProjectFlow {
	mode = $state<NewProjectMode>('folder');
	readonly browser: FolderBrowser;
	newFolder = $state('');
	gitInit = $state(true);
	repos = $state.raw<GitHubRepo[]>([]);
	reposLoading = $state(false);
	reposError = $state<string | null>(null);
	/** Picked from `repos`, else typed (a URL or `owner/repo`). */
	repo = $state.raw<GitHubRepo | null>(null);
	url = $state('');
	busy = $state(false);
	error = $state<string | null>(null);
	/** The project made; the dialog closes on it. */
	added = $state.raw<ProjectConfig | null>(null);
	private reposAsked = false;
	private readonly store: ControlPlaneStore;

	constructor(store: ControlPlaneStore, start?: string) {
		this.store = store;
		this.browser = new FolderBrowser((path) => store.listFolders(path));
		void this.openStart(start?.trim() || undefined);
	}

	/** `start`, else home: a saved folder that has gone mustn't leave nothing to browse. */
	private async openStart(start?: string) {
		await this.browser.open(start);
		if (start && !this.browser.listing) await this.browser.open();
	}

	/** The folder being browsed: where a new or cloned project goes. None while another
	 *  loads, so nothing lands in the folder just left. */
	get here(): string | null {
		return this.browser.loading ? null : (this.browser.listing?.path ?? null);
	}

	get hereIsProject(): boolean {
		const here = this.here;
		return here !== null && this.isProject(here);
	}

	isProject(path: string): boolean {
		return this.store.projects.some((p) => pathKey(p.path) === pathKey(path));
	}

	get cloneUrl(): string {
		return this.repo?.url ?? repoUrl(this.url);
	}

	setMode(mode: NewProjectMode) {
		this.mode = mode;
		this.error = null;
		if (mode === 'clone' && !this.reposAsked) void this.loadRepos();
	}

	async loadRepos() {
		this.reposAsked = true;
		this.reposLoading = true;
		this.reposError = null;
		try {
			this.repos = await this.store.listGithubRepos();
		} catch (e) {
			this.reposError = e instanceof Error ? e.message : String(e);
		} finally {
			this.reposLoading = false;
		}
	}

	/** Register the folder being browsed. */
	addHere(): Promise<void> {
		const here = this.here;
		return this.run(async () => (here ? this.store.addProject({ path: here, name: '' }) : null));
	}

	/** Make `newFolder` inside the folder being browsed and register it. */
	createHere(): Promise<void> {
		const here = this.here;
		const name = this.newFolder.trim();
		return this.run(async () => {
			if (!here || !name) return null;
			const path = await this.store.createFolder({ parent: here, name, gitInit: this.gitInit });
			return this.store.addProject({ path, name: '' });
		});
	}

	/** Clone the picked or typed repository into the folder being browsed. */
	cloneHere(): Promise<void> {
		const here = this.here;
		const url = this.cloneUrl;
		return this.run(async () =>
			here && url ? this.store.cloneProject({ url, parent: here }) : null
		);
	}

	private async run(make: () => Promise<ProjectConfig | null>) {
		if (this.busy) return;
		this.busy = true;
		this.error = null;
		try {
			this.added = await make();
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.busy = false;
		}
	}
}
