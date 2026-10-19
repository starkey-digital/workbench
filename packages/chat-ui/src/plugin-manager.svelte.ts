import type { AvailablePlugin, InstalledPlugin, PluginAction, PluginList } from '@workbench/types';
import type { AgentApi, PluginTarget } from './agent-api';

type PluginApi = Required<Pick<AgentApi, 'plugins' | 'changePlugin'>>;

/** Typing settles this long before the catalogue is searched. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * The `/plugin` sheet's state: the chat account's plugins in its folder and a
 * catalogue search. Every change is the host CLI's (`claude plugin`), and the
 * session's `claude` only picks it up once restarted, so a change sets
 * {@link needsRestart}.
 */
export class PluginManager {
	list = $state.raw<PluginList>({ installed: [], available: [] });
	query = $state('');
	loading = $state(false);
	error = $state<string | null>(null);
	/** The plugin a change is running on. */
	busy = $state<string | null>(null);
	needsRestart = $state(false);

	private readonly api: PluginApi;
	private readonly target: () => PluginTarget;
	private searchTimer: ReturnType<typeof setTimeout> | undefined;
	/** Only the newest load may land, so a slow search can't overwrite a newer one. */
	private loadSeq = 0;

	constructor(api: PluginApi, target: () => PluginTarget) {
		this.api = api;
		this.target = target;
	}

	async load(): Promise<void> {
		const seq = ++this.loadSeq;
		this.loading = true;
		try {
			const list = await this.api.plugins(this.target(), this.query);
			if (seq !== this.loadSeq) return;
			this.list = list;
			this.error = null;
		} catch (e) {
			if (seq === this.loadSeq) this.error = message(e);
		} finally {
			if (seq === this.loadSeq) this.loading = false;
		}
	}

	search(query: string): void {
		this.query = query;
		clearTimeout(this.searchTimer);
		this.searchTimer = setTimeout(() => void this.load(), SEARCH_DEBOUNCE_MS);
	}

	toggle(plugin: InstalledPlugin): Promise<void> {
		return this.change(plugin.enabled ? 'disable' : 'enable', plugin.id, plugin.scope);
	}

	install(plugin: AvailablePlugin): Promise<void> {
		return this.change('install', plugin.id, 'user');
	}

	update(plugin: InstalledPlugin): Promise<void> {
		return this.change('update', plugin.id, plugin.scope);
	}

	uninstall(plugin: InstalledPlugin): Promise<void> {
		return this.change('uninstall', plugin.id, plugin.scope);
	}

	dispose(): void {
		clearTimeout(this.searchTimer);
	}

	private async change(action: PluginAction, id: string, scope: string): Promise<void> {
		if (this.busy) return;
		this.busy = id;
		let failure: string | null = null;
		try {
			await this.api.changePlugin(this.target(), { action, id, scope });
			this.needsRestart = true;
		} catch (e) {
			failure = message(e);
		} finally {
			this.busy = null;
		}
		await this.load();
		// The reload clears the error; the change's own is the one to show.
		if (failure) this.error = failure;
	}
}

function message(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
