import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearInvokeMocks, invokeSpy, mockInvoke } from '../../../test/tauri-mocks';
import { CopyProjectFlow } from './copy-project.svelte';
import type { RemoteInstance } from '$features/instances/instances.svelte';
import type { ProjectConfig } from '$types/workbench';

const project: ProjectConfig = { name: 'App', path: '/repos/app' };

function remote(id: string, status: RemoteInstance['status'], token?: string) {
	return {
		config: { id, name: id, url: `http://${id}:4317/`, token },
		status,
		base: `http://${id}:4317`,
		store: { refresh: vi.fn() }
	} as unknown as RemoteInstance;
}

describe('CopyProjectFlow', () => {
	let flow: CopyProjectFlow;

	beforeEach(() => {
		clearInvokeMocks();
		flow = new CopyProjectFlow();
	});

	it('starts on the first online server, with nothing extra ticked', () => {
		flow.claudeConfig = true;
		flow.start(project, [remote('down', 'offline'), remote('mini', 'online')]);
		expect(flow.open).toBe(true);
		expect(flow.serverId).toBe('mini');
		expect(flow.claudeConfig).toBe(false);
		expect(flow.result).toBeNull();
	});

	it('sends the picked server, folder and Claude options, then refreshes that server', async () => {
		const mini = remote('mini', 'online', 'secret');
		const copied = {
			project: { name: 'App', path: '/Users/me/app' },
			claude: null,
			claudeError: null
		};
		mockInvoke('copy_project_to_server', () => copied);
		flow.start(project, [mini]);
		flow.parent = '  /Users/me/Repos ';
		flow.claudeAccounts = true;

		await flow.copy([mini]);

		expect(invokeSpy).toHaveBeenCalledWith('copy_project_to_server', {
			serverUrl: 'http://mini:4317',
			token: 'secret',
			projectPath: '/repos/app',
			projectName: 'App',
			parent: '/Users/me/Repos',
			claudeConfig: false,
			claudeAccounts: true
		});
		expect(flow.result).toEqual(copied);
		expect(flow.copying).toBe(false);
		expect(mini.store.refresh).toHaveBeenCalled();
	});

	it('shows the refusal and stays open for another try', async () => {
		const mini = remote('mini', 'online');
		mockInvoke('copy_project_to_server', () => {
			throw '/Users/me/app already exists on this host';
		});
		flow.start(project, [mini]);

		await flow.copy([mini]);

		expect(flow.error).toContain('already exists');
		expect(flow.result).toBeNull();
		expect(flow.open).toBe(true);
		expect(flow.copying).toBe(false);
	});
});
