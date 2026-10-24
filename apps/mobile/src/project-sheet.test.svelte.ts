import { expect, it } from 'vitest';
import type { FolderListing } from '@workbench/types';
import {
	accountFromOption,
	accountOption,
	DEFAULT_LOGIN,
	FOLLOW_ACTIVE,
	FolderBrowser,
	unknownAccount
} from './project-sheet.svelte';

it("maps a project's account to an option and back", () => {
	const accounts = [{ id: 'work' }];
	for (const id of [undefined, '', 'work', 'unknown']) {
		expect(accountFromOption(accountOption(id))).toBe(id);
	}
	expect(accountOption(undefined)).toBe(FOLLOW_ACTIVE);
	expect(accountOption('')).toBe(DEFAULT_LOGIN);
	expect(unknownAccount('unknown', accounts)).toBe(true);
	expect(unknownAccount('work', accounts)).toBe(false);
	expect(unknownAccount(FOLLOW_ACTIVE, [])).toBe(false);
});

it('keeps the newest folder when an older listing arrives late, and reports errors', async () => {
	const pending: Record<string, (l: FolderListing) => void> = {};
	const browser = new FolderBrowser((path = '~') =>
		path === '/bad'
			? Promise.reject(new Error('not a folder on this machine: /bad'))
			: new Promise((resolve) => (pending[path] = resolve))
	);
	const listing = (path: string): FolderListing => ({ path, parent: '/', folders: [] });

	const home = browser.open();
	const code = browser.open('/code');
	pending['/code'](listing('/code'));
	await code;
	pending['~'](listing('/home'));
	await home;
	expect(browser.listing?.path).toBe('/code');
	expect(browser.loading).toBe(false);

	await browser.open('/bad');
	expect(browser.error).toMatch(/not a folder/);
	expect(browser.listing?.path).toBe('/code');
});
