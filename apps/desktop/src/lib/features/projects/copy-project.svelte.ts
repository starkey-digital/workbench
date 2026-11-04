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

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** `512 B`, `9.9 MB`, `10 MB`, `3.4 GB`: one decimal below 10, judged after rounding. */
export function formatSize(bytes: number): string {
	let unit = 0;
	let n = Math.round(bytes);
	// Move up while the rounded figure would read 1024 or more (`1023.7 KB` is `1.0 MB`).
	while (unit < UNITS.length - 1 && Math.round(n) >= 1024) {
		n /= 1024;
		unit++;
	}
	if (unit === 0) return `${n} B`;
	const tenths = Math.round(n * 10) / 10;
	return tenths < 10 ? `${tenths.toFixed(1)} ${UNITS[unit]}` : `${Math.round(n)} ${UNITS[unit]}`;
}

export function formatLeft(seconds: number): string {
	const s = Math.max(1, Math.round(seconds));
	if (s < 60) return `about ${s}s left`;
	const mins = Math.floor(s / 60);
	if (mins < 60) return `about ${mins}m ${s % 60}s left`;
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
	/** Seeded from the server's copy folder. Blank: its clone folder, else its home. */
	parent = $state('');
	/** The server's folders while picking `parent`; null when not picking. */
	browser = $state.raw<FolderBrowser | null>(null);
	/** Save `parent` as the server's copy folder once the copy works. */
	makeDefault = $state(false);
	claudeConfig = $state(false);
	claudeAccounts = $state(false);
	copying = $state(false);
	error = $state('');
	result = $state<ProjectCopy | null>(null);
	/** The project upload's progress while copying; null until the folder is measured. */
	progress = $state.raw<CopyProgress | null>(null);
	/** The whole project is up; the server is finishing (then the Claude config). */
	uploaded = $state(false);
	private startedAt = 0;

	/** A `transfer:progress` event; timed from the first one (the folder measured). */
	onProgress(p: TransferProgress, now = Date.now()) {
		if (p.sent === 0) this.startedAt = now;
		this.progress = copyProgress(p, now - this.startedAt);
		this.uploaded = p.done;
	}

	start(project: ProjectConfig, remotes: RemoteInstance[]) {
		this.project = project;
		this.serverId = (remotes.find((r) => r.status === 'online') ?? remotes[0])?.config.id ?? '';
		this.chooseServer(remotes);
		this.claudeConfig = false;
		this.claudeAccounts = false;
		this.error = '';
		this.result = null;
		this.open = true;
	}

	/** `serverId` changed: start from its copy folder. */
	chooseServer(remotes: RemoteInstance[]) {
		this.parent = remotes.find((r) => r.config.id === this.serverId)?.config.copyFolder ?? '';
		this.browser = null;
		this.makeDefault = false;
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

	/** `remember` saves `parent` as that server's copy folder, when `makeDefault` and it worked. */
	async copy(
		remotes: RemoteInstance[],
		remember?: (serverId: string, copyFolder: string | undefined) => void
	) {
		const remote = remotes.find((r) => r.config.id === this.serverId);
		// While browsing, the folder shown isn't `parent` until it's picked.
		if (!this.project || !remote || this.copying || this.browser) return;
		this.copying = true;
		this.error = '';
		this.progress = null;
		this.uploaded = false;
		const parent = this.parent.trim();
		let unlisten: (() => void) | undefined;
		try {
			unlisten = await listen<TransferProgress>('transfer:progress', (e) =>
				this.onProgress(e.payload)
			);
			this.result = await invoke<ProjectCopy>('copy_project_to_server', {
				serverUrl: remote.base,
				token: remote.config.token ?? null,
				projectPath: this.project.path,
				projectName: this.project.name,
				parent: parent || null,
				claudeConfig: this.claudeConfig,
				claudeAccounts: this.claudeAccounts
			});
			void remote.store.refresh();
			if (this.makeDefault) remember?.(remote.config.id, parent || undefined);
		} catch (e) {
			this.error = String(e);
		} finally {
			unlisten?.();
			this.copying = false;
		}
	}
}
