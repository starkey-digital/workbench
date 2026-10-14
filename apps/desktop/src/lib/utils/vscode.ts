import { invoke } from '@tauri-apps/api/core';
import { log } from '$lib/log';

/** Open a project folder in VS Code */
export async function openInVSCode(projectPath: string): Promise<void> {
	try {
		await invoke('open_in_vscode', { path: projectPath });
	} catch (e) {
		log.error('vscode', 'Failed to open VS Code:', e);
	}
}
