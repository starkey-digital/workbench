import type { ClaudeAccount, FolderListing } from '@workbench/types';

/** Account `<select>` values that aren't account ids: `:` never starts one. */
export const FOLLOW_ACTIVE = ':active';
export const DEFAULT_LOGIN = ':default';

/** A project's `claudeAccountId` as an option; a removed account's shows as following the active one. */
export function accountOption(
	id: string | undefined,
	accounts: Pick<ClaudeAccount, 'id'>[]
): string {
	if (id === undefined) return FOLLOW_ACTIVE;
	if (id === '') return DEFAULT_LOGIN;
	return accounts.some((a) => a.id === id) ? id : FOLLOW_ACTIVE;
}

export function accountFromOption(option: string): string | undefined {
	if (option === FOLLOW_ACTIVE) return undefined;
	return option === DEFAULT_LOGIN ? '' : option;
}

/** One folder of the host at a time; a late listing never replaces a newer pick. */
export class FolderBrowser {
	listing = $state.raw<FolderListing | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	private request = 0;
	private readonly list: (path?: string) => Promise<FolderListing>;

	constructor(list: (path?: string) => Promise<FolderListing>) {
		this.list = list;
	}

	async open(path?: string): Promise<void> {
		const request = ++this.request;
		this.loading = true;
		this.error = null;
		try {
			const listing = await this.list(path);
			if (request === this.request) this.listing = listing;
		} catch (e) {
			if (request === this.request) this.error = e instanceof Error ? e.message : String(e);
		} finally {
			if (request === this.request) this.loading = false;
		}
	}
}
