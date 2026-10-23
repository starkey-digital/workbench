import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
	onAction
} from '@tauri-apps/plugin-notification';
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window';
import { toast } from 'svelte-sonner';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { SvelteMap } from 'svelte/reactivity';
import { visibleSplit } from '$features/terminal/split-view';
import { baseName } from '$lib/utils/path';
import type { AttentionTarget, ClaudeSessionStore } from './claudeSessions.svelte';
import type { WorkspaceStore } from './workspaces.svelte';
import { log } from '$lib/log';

/** A notification's text per attention kind, as the phone words it (`NotificationFeed.kt`). */
export const ATTENTION_TEXT = {
	waiting: 'Approval or answer needed',
	turnEnded: 'Turn complete'
} as const;

const targetId = (target: AttentionTarget) => ('paneId' in target ? target.paneId : target.id);
/** Keyed by session: the pane may be gone by the time its question resolves. */
const toastId = (target: AttentionTarget) =>
	`attention:${'paneId' in target ? target.sessionId : target.id}`;

export class NotificationStore {
	/**
	 * Deliver through the native UNUserNotificationCenter bridge rather than the plugin.
	 * True on bundled macOS builds. The plugin's macOS path posts to
	 * NSUserNotificationCenter, which macOS stopped delivering after 10.15, and discards
	 * the error — so it fails silently and cannot be detected from here.
	 */
	private native = false;
	/** Plugin path only: whether permission was granted. */
	private enabled = false;
	/**
	 * Every post and withdrawal runs in arrival order after the probe: a
	 * withdrawal must never overtake the post it takes down, or that banner stays.
	 */
	private queue: Promise<void>;
	private workspaces: WorkspaceStore;
	/** Plugin path only: notification id (numeric hash) → paneId for click routing. */
	private idToPane = new SvelteMap<number, string>();

	constructor(workspaces: WorkspaceStore, sessions: ClaudeSessionStore) {
		this.workspaces = workspaces;
		this.queue = this.init();

		sessions.onAttention((target, kind) => {
			if (kind === 'resolved') this.enqueue(() => this.withdraw(target));
			else this.enqueue(() => this.notify(target, kind));
		});
	}

	private enqueue(op: () => Promise<void>): void {
		this.queue = this.queue.then(op).catch((e) => {
			log.warn('NotificationStore', 'Notification update failed:', e);
		});
	}

	private async init(): Promise<void> {
		try {
			this.native = await invoke<boolean>('is_native_notification_available');
		} catch {
			// Command isn't registered off macOS, and is absent on unbundled dev builds.
			this.native = false;
		}

		if (this.native) {
			// The identifier is the paneId, so clicks route back without a lookup table.
			// Authorization is requested natively during setup(), before the app finishes
			// launching — doing it here would drop responses for early notifications.
			await listen<string>('notification:action', (event) => {
				void this.focusPane(event.payload);
			}).catch((e) => {
				log.warn('NotificationStore', 'Failed to listen for actions:', e);
			});
			return;
		}

		try {
			let granted = await isPermissionGranted();
			if (!granted) {
				granted = (await requestPermission()) === 'granted';
			}
			this.enabled = granted;
		} catch (e) {
			log.warn('NotificationStore', 'Notification permission unavailable:', e);
			this.enabled = false;
		}

		onAction(({ notification }) => {
			const id = typeof notification?.id === 'number' ? notification.id : NaN;
			if (!Number.isFinite(id)) return;
			const paneId = this.idToPane.get(id);
			if (!paneId) return;
			void this.focusPane(paneId);
		}).catch((e) => {
			log.warn('NotificationStore', 'Failed to register action handler:', e);
		});
	}

	private findContext(paneId: string): {
		tabLabel: string;
		projectName: string;
	} | null {
		for (const ws of this.workspaces.workspaces) {
			for (const tab of ws.terminalTabs) {
				if (tab.panes.some((p) => p.id === paneId)) {
					return { tabLabel: tab.label, projectName: ws.projectName };
				}
			}
		}
		return null;
	}

	private async isWindowFocused(): Promise<boolean> {
		try {
			return await getCurrentWindow().isFocused();
		} catch {
			return false;
		}
	}

	private isPaneActive(paneId: string): boolean {
		const ws = this.workspaces.activeWorkspace;
		if (!ws) return false;
		const shown =
			visibleSplit(ws)?.tabs ?? ws.terminalTabs.filter((t) => t.id === ws.activeTerminalTabId);
		return shown.some((tab) => tab.panes.some((p) => p.id === paneId));
	}

	/**
	 * Take down a session's notification once nobody is needed. Only the native
	 * macOS path does: `tauri-plugin-notification` removes only on Linux and the
	 * BSDs, and only notifications shown while an `onAction` listener exists.
	 */
	private async withdraw(target: AttentionTarget): Promise<void> {
		// Posted under the pane, or under the session while no pane showed it.
		const ids = 'paneId' in target ? [target.paneId, target.sessionId] : [target.id];
		toast.dismiss(toastId(target));
		getCurrentWindow()
			.requestUserAttention(null)
			.catch(() => {});
		if (!this.native) return;
		for (const identifier of ids) {
			try {
				await invoke('remove_native_notification', { identifier });
			} catch (e) {
				log.warn('NotificationStore', 'Failed to remove notification:', e);
			}
		}
	}

	private async notify(target: AttentionTarget, kind: keyof typeof ATTENTION_TEXT): Promise<void> {
		// A session no pane shows here (started on the phone) is routed by its id;
		// a click on it just brings the window forward.
		const paneId = targetId(target);
		const focused = await this.isWindowFocused();
		// Suppress only when the user is actively looking at THIS pane —
		// other panes still get notified even when the window is focused.
		if (focused && this.isPaneActive(paneId)) return;
		const ctx =
			'paneId' in target
				? this.findContext(paneId)
				: { projectName: baseName(target.projectPath), tabLabel: target.label };
		if (!ctx) return;

		const title = `${ctx.projectName} — ${ctx.tabLabel}`;
		const body = ATTENTION_TEXT[kind];

		// A question in the app already: an OS banner is easy to miss there, a toast
		// isn't. It stays up until it's answered (`withdraw`) or dismissed.
		if (focused && kind === 'waiting') {
			toast.warning(title, {
				id: toastId(target),
				description: body,
				duration: Infinity,
				action:
					'paneId' in target
						? { label: 'Show', onClick: () => void this.focusPane(paneId) }
						: undefined
			});
			return;
		}
		if (!focused && kind === 'waiting') {
			getCurrentWindow()
				.requestUserAttention(UserAttentionType.Informational)
				.catch(() => {});
		}

		if (this.native) {
			try {
				const delivered = await invoke<boolean>('send_native_notification', {
					identifier: paneId,
					title,
					body
				});
				// False means authorization was refused — the user's OS-level choice.
				if (!delivered) {
					log.warn('NotificationStore', 'Notification not delivered (not authorized)');
				}
			} catch (e) {
				log.warn('NotificationStore', 'Native notification failed:', e);
			}
			return;
		}

		if (!this.enabled) return;
		const notificationId = this.hashId(paneId);
		this.idToPane.set(notificationId, paneId);
		try {
			sendNotification({ id: notificationId, title, body });
		} catch (e) {
			log.warn('NotificationStore', 'Failed to send notification:', e);
		}
	}

	private hashId(paneId: string): number {
		let hash = 0;
		for (let i = 0; i < paneId.length; i++) {
			hash = (hash * 31 + paneId.charCodeAt(i)) | 0;
		}
		// The plugin's id must fit an i32; Math.abs(-2^31) doesn't.
		return hash & 0x7fffffff;
	}

	private async focusPane(paneId: string): Promise<void> {
		try {
			const win = getCurrentWindow();
			await win.unminimize();
			await win.show();
			await win.setFocus();
		} catch (e) {
			log.warn('NotificationStore', 'Failed to focus window:', e);
		}
		this.workspaces.focusPane(paneId);
	}
}
