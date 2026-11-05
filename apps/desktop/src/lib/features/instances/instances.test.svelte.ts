import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstancesStore, RemoteInstance } from './instances.svelte.ts';

/** Object-backed localStorage stub (this jsdom env's localStorage lacks `clear`). */
function stubLocalStorage() {
	const mem: Record<string, string> = {};
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => (k in mem ? mem[k] : null),
		setItem: (k: string, v: string) => void (mem[k] = String(v)),
		removeItem: (k: string) => void delete mem[k],
		clear: () => {
			for (const k of Object.keys(mem)) delete mem[k];
		}
	});
}

describe('InstancesStore', () => {
	beforeEach(() => {
		stubLocalStorage();
		// add()/setActive() health-ping on a background promise; keep them offline
		// and off the network so the tests don't hit a real server.
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.reject(new Error('no network')))
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('load() ignores a non-array persisted config instead of crashing', () => {
		localStorage.setItem('workbench.instances', '{"not":"an array"}');
		const store = new InstancesStore();
		expect(() => store.load()).not.toThrow();
		expect(store.remotes).toEqual([]);
		store.dispose();
	});

	it('load() ignores malformed JSON', () => {
		localStorage.setItem('workbench.instances', 'definitely not json{');
		const store = new InstancesStore();
		store.load();
		expect(store.remotes).toEqual([]);
		store.dispose();
	});

	it('load() restores persisted remotes', () => {
		localStorage.setItem(
			'workbench.instances',
			JSON.stringify([{ id: 'a', name: 'box', url: 'http://box:4317' }])
		);
		const store = new InstancesStore();
		store.load();
		expect(store.remotes).toHaveLength(1);
		expect(store.remotes[0].config.name).toBe('box');
		store.dispose();
	});

	it('load() skips entries that are not server configs', () => {
		localStorage.setItem(
			'workbench.instances',
			JSON.stringify([null, 'x', { id: 'a' }, { id: 'b', name: 'box', url: 'http://box:4317' }])
		);
		const store = new InstancesStore();
		store.load();
		expect(store.remotes.map((r) => r.config.id)).toEqual(['b']);
		store.dispose();
	});

	it('add() and remove() work while storage refuses writes', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal('localStorage', {
			getItem: () => null,
			setItem: () => {
				throw new Error('blocked');
			}
		});
		const store = new InstancesStore();
		const inst = store.add({ name: 'box', url: 'http://box:4317' });
		expect(store.remotes).toHaveLength(1);
		store.remove(inst.config.id);
		expect(store.remotes).toHaveLength(0);
		store.dispose();
	});

	it('remove() resets active to local', () => {
		const store = new InstancesStore();
		const inst = store.add({ name: 'box', url: 'http://box:4317' });
		store.setActive(inst.config.id);

		store.remove(inst.config.id);

		expect(store.remotes).toHaveLength(0);
		expect(store.activeId).toBe('local');
		store.dispose();
	});

	it('update() renames in place, keeping the connection', () => {
		const store = new InstancesStore();
		const inst = store.add({ name: 'box', url: 'http://box:4317', token: 't' });
		store.setActive(inst.config.id);

		store.update(inst.config.id, { name: 'mini', copyFolder: '/srv' });

		expect(store.remotes[0]).toBe(inst);
		expect(inst.config).toMatchObject({ name: 'mini', url: 'http://box:4317', copyFolder: '/srv' });
		expect(JSON.parse(localStorage.getItem('workbench.instances')!)[0].name).toBe('mini');
		store.dispose();
	});

	it('update() reconnects on a new token, keeping the id and active server', () => {
		const store = new InstancesStore();
		const inst = store.add({ name: 'box', url: 'http://box:4317', token: 'old' });
		store.setActive(inst.config.id);
		const dispose = vi.spyOn(inst, 'dispose');

		store.update(inst.config.id, { token: 'new' });

		expect(dispose).toHaveBeenCalled();
		expect(store.remotes[0]).not.toBe(inst);
		expect(store.remotes[0].config).toMatchObject({ id: inst.config.id, token: 'new' });
		expect(store.activeRemote).toBe(store.remotes[0]);
		store.dispose();
	});

	it('update() gives a new URL a new id, and the active server follows it', () => {
		const store = new InstancesStore();
		const inst = store.add({ name: 'box', url: 'http://box:4317' });
		store.setActive(inst.config.id);

		store.update(inst.config.id, { url: 'http://mini:4317' });

		expect(store.remotes[0].config.id).not.toBe(inst.config.id);
		expect(store.activeRemote).toBe(store.remotes[0]);
		store.dispose();
	});

	it('dispose() clears the health poll interval', () => {
		const store = new InstancesStore();
		store.load(); // starts the 15s health poll
		const clearSpy = vi.spyOn(globalThis, 'clearInterval');
		store.dispose();
		expect(clearSpy).toHaveBeenCalled();
	});
});

describe('RemoteInstance.checkHealth', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('reloads projects on every offline→online transition', async () => {
		const inst = new RemoteInstance({ id: '1', name: 'box', url: 'http://box:4317' });
		const refresh = vi.spyOn(inst.store, 'refresh').mockResolvedValue(undefined);

		const online = () =>
			vi.stubGlobal(
				'fetch',
				vi.fn(() => Promise.resolve({ ok: true }))
			);
		const offline = () =>
			vi.stubGlobal(
				'fetch',
				vi.fn(() => Promise.reject(new Error('down')))
			);

		online();
		await inst.checkHealth();
		expect(inst.status).toBe('online');
		expect(refresh).toHaveBeenCalledTimes(1);

		// Still online → no redundant reload.
		await inst.checkHealth();
		expect(refresh).toHaveBeenCalledTimes(1);

		offline();
		await inst.checkHealth();
		expect(inst.status).toBe('offline');
		expect(refresh).toHaveBeenCalledTimes(1);

		// Recovered → reload again (the bug the loadedOnce latch used to skip).
		online();
		await inst.checkHealth();
		expect(inst.status).toBe('online');
		expect(refresh).toHaveBeenCalledTimes(2);
	});

	it("re-reads the host's accounts on every poll, so one added there shows up", async () => {
		const inst = new RemoteInstance({ id: '1', name: 'box', url: 'http://box:4317' });
		vi.spyOn(inst.store, 'refresh').mockResolvedValue(undefined);
		vi.spyOn(inst.hostUpdate, 'check').mockResolvedValue(undefined);
		const loadAccounts = vi.fn(async () => {});
		// The session itself needs a whole workspace store; only its account reload matters here.
		(inst as unknown as { remoteSession: unknown }).remoteSession = {
			session: { loadAccounts, dispose: () => {} },
			destroy: () => {}
		};
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve({ ok: true }))
		);
		await inst.checkHealth();
		await inst.checkHealth();
		expect(loadAccounts).toHaveBeenCalledTimes(2);
	});

	it("checks the host's update on connect, and on every poll while one installs", async () => {
		const inst = new RemoteInstance({ id: '1', name: 'box', url: 'http://box:4317' });
		vi.spyOn(inst.store, 'refresh').mockResolvedValue(undefined);
		const check = vi.spyOn(inst.hostUpdate, 'check').mockResolvedValue(undefined);
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve({ ok: true }))
		);

		vi.useFakeTimers();
		await inst.checkHealth();
		await inst.checkHealth();
		expect(check).toHaveBeenCalledTimes(1);

		inst.hostUpdate.target = '1.1.0';
		await inst.checkHealth();
		expect(check).toHaveBeenCalledTimes(2);

		// A release out since connecting shows up within ten minutes.
		inst.hostUpdate.target = null;
		vi.advanceTimersByTime(10 * 60_000);
		await inst.checkHealth();
		expect(check).toHaveBeenCalledTimes(3);
		vi.useRealTimers();
	});
});
