import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPlugin, PluginList } from '@workbench/types';
import { PluginManager, SEARCH_DEBOUNCE_MS } from './plugin-manager.svelte';

const lint: InstalledPlugin = { id: 'lint@m', scope: 'project', enabled: true };
const listed: PluginList = {
	installed: [lint],
	available: [{ id: 'fmt@m', name: 'fmt', description: 'Formats', marketplace: 'm' }]
};
const target = { projectPath: '/repo', claudeAccountId: 'work' };

function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

function setup(overrides: Partial<{ plugins: unknown; changePlugin: unknown }> = {}) {
	const api = {
		plugins: vi.fn(async (_target: unknown, _query: string) => listed),
		changePlugin: vi.fn(async () => {}),
		...overrides
	} as unknown as ConstructorParameters<typeof PluginManager>[0] & {
		plugins: ReturnType<typeof vi.fn>;
		changePlugin: ReturnType<typeof vi.fn>;
	};
	return { api, manager: new PluginManager(api, () => target) };
}

describe('PluginManager', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('loads the chat folder and account plugins', async () => {
		const { api, manager } = setup();
		await manager.load();
		expect(api.plugins).toHaveBeenCalledWith(target, '');
		expect(manager.list).toEqual(listed);
		expect(manager.loading).toBe(false);
	});

	it('searches once typing settles', async () => {
		const { api, manager } = setup();
		manager.search('f');
		manager.search('fmt');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(api.plugins).toHaveBeenCalledTimes(1);
		expect(api.plugins).toHaveBeenCalledWith(target, 'fmt');
	});

	it('keeps the newest search when an older one answers last', async () => {
		const slow = deferred<PluginList>();
		const fast: PluginList = { installed: [], available: [] };
		const plugins = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValueOnce(fast);
		const { manager } = setup({ plugins });
		const first = manager.load();
		await manager.load();
		slow.resolve(listed);
		await first;
		expect(manager.list).toBe(fast);
	});

	it('switches a plugin in its own scope and asks for a restart', async () => {
		const { api, manager } = setup();
		await manager.toggle(lint);
		expect(api.changePlugin).toHaveBeenCalledWith(target, {
			action: 'disable',
			id: 'lint@m',
			scope: 'project'
		});
		expect(manager.needsRestart).toBe(true);
		expect(manager.busy).toBeNull();
		expect(api.plugins).toHaveBeenCalledTimes(1);
	});

	it('installs from the catalogue for the user', async () => {
		const { api, manager } = setup();
		await manager.install(listed.available[0]);
		expect(api.changePlugin).toHaveBeenCalledWith(target, {
			action: 'install',
			id: 'fmt@m',
			scope: 'user'
		});
	});

	it('shows a refused change after the list reloads', async () => {
		const changePlugin = vi.fn(async () => {
			throw new Error('Install it in a terminal');
		});
		const { manager } = setup({ changePlugin });
		await manager.install(listed.available[0]);
		expect(manager.error).toBe('Install it in a terminal');
		expect(manager.needsRestart).toBe(false);
	});

	it('runs one change at a time', async () => {
		const pending = deferred<void>();
		const changePlugin = vi.fn(() => pending.promise);
		const { manager } = setup({ changePlugin });
		const first = manager.toggle(lint);
		await manager.uninstall(lint);
		pending.resolve();
		await first;
		expect(changePlugin).toHaveBeenCalledTimes(1);
	});
});
