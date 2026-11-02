import type { FolderListing } from '@workbench/types';

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
