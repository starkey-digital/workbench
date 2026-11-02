import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FolderBrowser } from '@workbench/control-plane-ui';
import type { RemoteInstance } from '$features/instances/instances.svelte';
import type { ProjectConfig, ProjectCopy, TransferProgress } from '$types/workbench';

/** An upload's progress as the dialog shows it. */
export interface CopyProgress {
	/** 0–1. */
	fraction: number;
	/** `1.2 GB of 3.4 GB`. */
	amount: string;
	/** `12.5 MB/s`, once there's enough to tell. */
	rate: string | null;
	/** `about 3m 20s left`, once there's enough to tell. */
	eta: string | null;
}

/** Below this the rate is mostly noise from the first chunks. */
const SETTLE_MS = 1500;

export function formatSize(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let n = bytes;
	let unit = 0;
	while (n >= 1024 && unit < units.length - 1) {
		n /= 1024;
		unit++;
	}
	return unit === 0 ? `${n} B` : `${n.toFixed(n < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatLeft(seconds: number): string {
	if (seconds < 60) return `about ${Math.max(1, Math.round(seconds))}s left`;
	const mins = Math.floor(seconds / 60);
	if (mins < 60) return `about ${mins}m ${Math.round(seconds % 60)}s left`;
	return `about ${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

/** Progress after `elapsedMs` of uploading, at the average rate so far. */
export function copyProgress({ sent, total }: TransferProgress, elapsedMs: number): CopyProgress {
	const done = Math.min(sent, total);
	const fraction = total > 0 ? done / total : 1;
	const perSecond = elapsedMs > 0 ? (done * 1000) / elapsedMs : 0;
	const settled = elapsedMs >= SETTLE_MS && perSecond > 0;
	return {
		fraction,
		amount: `${formatSize(done)} of ${formatSize(total)}`,
		rate: settled ? `${formatSize(perSecond)}/s` : null,
		eta: settled && done < total ? formatLeft((total - done) / perSecond) : null
	};
}

/** The "Copy to Server" dialog: which project, where to, and how it went. */
export class CopyProjectFlow {
	open = $state(false);
	project = $state<ProjectConfig | null>(null);
	serverId = $state('');
	/** Blank: the server's clone folder, else its home. */
	parent = $state('');
	/** The server's folders while picking `parent`; null when not picking. */
	browser = $state.raw<FolderBrowser | null>(null);
	claudeConfig = $state(false);
	claudeAccounts = $state(false);
	copying = $state(false);
	error = $state('');
	result = $state<ProjectCopy | null>(null);
	/** The project upload's progress while copying; null until the folder is measured. */
	progress = $state.raw<CopyProgress | null>(null);
	/** The project is up; the Claude config is going. */
	uploaded = $state(false);
	private startedAt = 0;

	/** A `transfer:progress` event; timed from the first one (the folder measured). */
	onProgress(p: TransferProgress, now = Date.now()) {
		if (p.sent === 0) this.startedAt = now;
		this.progress = copyProgress(p, now - this.startedAt);
		this.uploaded = p.total > 0 && p.sent >= p.total;
	}

	start(project: ProjectConfig, remotes: RemoteInstance[]) {
		this.project = project;
		this.serverId = (remotes.find((r) => r.status === 'online') ?? remotes[0])?.config.id ?? '';
		this.parent = '';
		this.browser = null;
		this.claudeConfig = false;
		this.claudeAccounts = false;
		this.error = '';
		this.result = null;
		this.open = true;
	}

	/** Browse the chosen server's folders, from the typed folder (else its home). */
	browse(remotes: RemoteInstance[]) {
		const remote = remotes.find((r) => r.config.id === this.serverId);
		if (!remote) return;
		this.browser = new FolderBrowser((path) => remote.store.listFolders(path));
		void this.browser.open(this.parent.trim() || undefined);
	}

	/** Copy into the folder being browsed. */
	pick() {
		const listing = this.browser?.listing;
		if (listing) this.parent = listing.path;
		this.browser = null;
	}

	async copy(remotes: RemoteInstance[]) {
		const remote = remotes.find((r) => r.config.id === this.serverId);
		if (!this.project || !remote || this.copying) return;
		this.copying = true;
		this.error = '';
		this.progress = null;
		this.uploaded = false;
		const unlisten = await listen<TransferProgress>('transfer:progress', (e) =>
			this.onProgress(e.payload)
		);
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
			unlisten();
			this.copying = false;
		}
	}
}
