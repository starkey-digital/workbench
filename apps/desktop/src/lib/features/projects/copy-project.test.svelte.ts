import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearInvokeMocks, invokeSpy, mockInvoke } from '../../../test/tauri-mocks';
import { CopyProjectFlow, copyProgress, formatLeft, formatSize } from './copy-project.svelte';
import type { RemoteInstance } from '$features/instances/instances.svelte';
import type { ProjectConfig } from '$types/workbench';

const project: ProjectConfig = { name: 'App', path: '/repos/app' };

function remote(id: string, status: RemoteInstance['status'], token?: string) {
	return {
		config: { id, name: id, url: `http://${id}:4317/`, token },
		status,
		base: `http://${id}:4317`,
		store: {
			refresh: vi.fn(),
			listFolders: vi.fn(async (path?: string) => ({
				path: path ?? '/home/me',
				parent: path ? '/home/me' : null,
				folders: []
			}))
		}
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

	it("picks the folder to copy into from the server's own folders", async () => {
		const mini = remote('mini', 'online');
		flow.start(project, [mini]);
		flow.browse([mini]);
		await vi.waitFor(() => expect(flow.browser?.listing?.path).toBe('/home/me'));
		await flow.browser?.open('/home/me/Repos');
		flow.pick();
		expect(flow.parent).toBe('/home/me/Repos');
		expect(flow.browser).toBeNull();
		expect(mini.store.listFolders).toHaveBeenCalledWith(undefined);
	});

	it('browses from the folder already typed', () => {
		const mini = remote('mini', 'online');
		flow.start(project, [mini]);
		flow.parent = ' /srv ';
		flow.browse([mini]);
		expect(mini.store.listFolders).toHaveBeenCalledWith('/srv');
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

describe('copy progress', () => {
	const MB = 1024 * 1024;
	const at = (sent: number, total: number, done = false) => ({ sent, total, done });

	it('formats sizes from bytes to GB, deciding decimals after rounding', () => {
		expect(formatSize(512)).toBe('512 B');
		expect(formatSize(1.5 * MB)).toBe('1.5 MB');
		expect(formatSize(340 * MB)).toBe('340 MB');
		expect(formatSize(3.4 * 1024 * MB)).toBe('3.4 GB');
		expect(formatSize(9.96 * MB)).toBe('10 MB');
		expect(formatSize(1023.7 * 1024)).toBe('1.0 MB');
	});

	it('never shows 60 seconds in a minute', () => {
		expect(formatLeft(119.6)).toBe('about 2m 0s left');
		expect(formatLeft(59.6)).toBe('about 1m 0s left');
		expect(formatLeft(0.2)).toBe('about 1s left');
		expect(formatLeft(3725)).toBe('about 1h 2m left');
	});

	it('holds back the rate and ETA until it has settled', () => {
		const early = copyProgress(at(5 * MB, 100 * MB), 500);
		expect(early.fraction).toBe(0.05);
		expect(early.rate).toBeNull();
		expect(early.eta).toBeNull();
	});

	it('estimates time left at the average rate so far', () => {
		// 20 MB in 4s is 5 MB/s; 80 MB to go is 16s.
		const p = copyProgress(at(20 * MB, 100 * MB), 4000);
		expect(p.amount).toBe('20 MB of 100 MB');
		expect(p.rate).toBe('5.0 MB/s');
		expect(p.eta).toBe('about 16s left');
		expect(copyProgress(at(10 * MB, 1000 * MB), 2000).eta).toBe('about 3m 18s left');
	});

	it('says the upload is done only when the sender does', () => {
		const flow = new CopyProjectFlow();
		flow.onProgress(at(0, 100), 1000);
		expect(flow.progress?.fraction).toBe(0);
		flow.onProgress(at(100, 100), 5000);
		expect(flow.progress?.fraction).toBe(1);
		expect(flow.progress?.eta).toBeNull();
		expect(flow.uploaded).toBe(false);
		flow.onProgress(at(100, 100, true), 5100);
		expect(flow.uploaded).toBe(true);
	});

	it("won't copy while a folder is being browsed, not yet picked", async () => {
		const flow = new CopyProjectFlow();
		const mini = remote('mini', 'online');
		flow.start(project, [mini]);
		flow.browse([mini]);
		await flow.copy([mini]);
		expect(invokeSpy).not.toHaveBeenCalledWith('copy_project_to_server', expect.anything());
	});

	it('recovers when the progress listener fails to start', async () => {
		const { listenSpy } = await import('../../../test/tauri-mocks');
		listenSpy.mockRejectedValueOnce(new Error('not allowed'));
		const flow = new CopyProjectFlow();
		const mini = remote('mini', 'online');
		flow.start(project, [mini]);
		await flow.copy([mini]);
		expect(flow.copying).toBe(false);
		expect(flow.error).toContain('not allowed');
	});
});
