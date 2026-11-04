import { describe, expect, it, vi } from 'vitest';
import { createMockTransport } from '@workbench/transport';
import { ControlPlaneStore } from '@workbench/control-plane-ui';
import { NewProjectFlow } from './new-project.svelte';
import { repoUrl } from '$lib/utils/repo-url';

function setup(projects: { name: string; path: string }[] = []) {
	const transport = createMockTransport();
	const calls: [string, unknown][] = [];
	const answer = (name: Parameters<typeof transport.mockInvoke>[0], reply: (a: never) => unknown) =>
		transport.mockInvoke(name, (args) => {
			calls.push([name, args]);
			return reply(args as never);
		});
	answer('list_folders', (a: { path?: string }) => ({
		path: a.path ?? '/home/me',
		parent: '/home',
		folders: [{ name: 'app', path: '/home/me/app', git: true }]
	}));
	answer('add_project', (a: { edit: { path: string } }) => ({ name: 'x', path: a.edit.path }));
	answer(
		'create_folder',
		(a: { request: { parent: string; name: string } }) => `${a.request.parent}/${a.request.name}`
	);
	answer('clone_project', (a: { request: { parent: string } }) => ({
		name: 'app',
		path: `${a.request.parent}/app`
	}));
	answer('github_list_repos', () => [
		{ name: 'app', nameWithOwner: 'acme/app', url: 'https://github.com/acme/app' }
	]);
	const store = new ControlPlaneStore(transport);
	store.projects = projects;
	return { store, calls };
}

const ready = (flow: NewProjectFlow) => vi.waitFor(() => expect(flow.here).not.toBeNull());

describe('NewProjectFlow', () => {
	it('starts in the folder given, else home', async () => {
		const { store } = setup();
		const flow = new NewProjectFlow(store, ' /srv ');
		await ready(flow);
		expect(flow.here).toBe('/srv');
		const home = new NewProjectFlow(store);
		await ready(home);
		expect(home.here).toBe('/home/me');
	});

	it("falls back to home when the start folder can't be listed", async () => {
		const { store } = setup();
		const list = store.listFolders.bind(store);
		vi.spyOn(store, 'listFolders').mockImplementation((path) =>
			path === '/gone' ? Promise.reject(new Error('no such folder')) : list(path)
		);
		const flow = new NewProjectFlow(store, '/gone');
		await ready(flow);
		expect(flow.here).toBe('/home/me');
	});

	it('adds the folder shown, and knows one that is already a project', async () => {
		const { store, calls } = setup([{ name: 'me', path: '/home/me/' }]);
		const flow = new NewProjectFlow(store);
		await ready(flow);
		expect(flow.hereIsProject).toBe(true);
		expect(flow.isProject('/home/me/app')).toBe(false);

		await flow.browser.open('/home/me/app');
		await flow.addHere();
		expect(calls[calls.length - 1]).toEqual([
			'add_project',
			{ edit: { path: '/home/me/app', name: '' } }
		]);
		expect(flow.added?.path).toBe('/home/me/app');
		expect(store.projects.map((p) => p.path)).toContain('/home/me/app');
	});

	it('makes a new folder where it is browsing, then adds it', async () => {
		const { store, calls } = setup();
		const flow = new NewProjectFlow(store);
		await ready(flow);
		flow.newFolder = ' fresh ';
		flow.gitInit = false;
		await flow.createHere();
		expect(calls.slice(-2)).toEqual([
			['create_folder', { request: { parent: '/home/me', name: 'fresh', gitInit: false } }],
			['add_project', { edit: { path: '/home/me/fresh', name: '' } }]
		]);
		expect(flow.added?.path).toBe('/home/me/fresh');
	});

	it('loads the repos once on first switch to Clone, and clones into the folder shown', async () => {
		const { store, calls } = setup();
		const flow = new NewProjectFlow(store);
		await ready(flow);
		flow.setMode('clone');
		await vi.waitFor(() => expect(flow.repos).toHaveLength(1));
		flow.setMode('folder');
		flow.setMode('clone');
		expect(calls.filter(([n]) => n === 'github_list_repos')).toHaveLength(1);

		flow.url = 'acme/other';
		expect(flow.cloneUrl).toBe('https://github.com/acme/other');
		flow.repo = flow.repos[0];
		await flow.cloneHere();
		expect(calls[calls.length - 1]).toEqual([
			'clone_project',
			{ request: { url: 'https://github.com/acme/app', parent: '/home/me' } }
		]);
		expect(flow.added?.path).toBe('/home/me/app');
	});

	it('shows a refusal and stays open', async () => {
		const { store } = setup();
		const flow = new NewProjectFlow(store);
		await ready(flow);
		vi.spyOn(store, 'createFolder').mockRejectedValue(new Error('already exists on this host'));
		flow.newFolder = 'taken';
		await flow.createHere();
		expect(flow.error).toContain('already exists');
		expect(flow.added).toBeNull();
		expect(flow.busy).toBe(false);
	});
});

describe('repoUrl', () => {
	it('keeps URLs, expands owner/repo to GitHub, and leaves blank blank', () => {
		expect(repoUrl(' git@github.com:a/b.git ')).toBe('git@github.com:a/b.git');
		expect(repoUrl('https://gitlab.com/a/b')).toBe('https://gitlab.com/a/b');
		expect(repoUrl('a/b')).toBe('https://github.com/a/b');
		expect(repoUrl('  ')).toBe('');
	});
});
