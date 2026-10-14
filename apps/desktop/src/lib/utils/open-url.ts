import { invoke } from '@tauri-apps/api/core';
import { toast } from 'svelte-sonner';
import { log } from '$lib/log';

/** Open an http(s), mailto or tel URL in its default handler, surfacing failures as a toast. */
export async function openUrl(url: string): Promise<void> {
	try {
		await invoke('open_url', { url });
	} catch (e) {
		log.error('open-url', 'Failed to open a link:', e);
		toast.error(`Couldn't open link: ${String(e)}`);
	}
}
