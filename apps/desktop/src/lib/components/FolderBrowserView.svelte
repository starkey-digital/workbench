<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderGitIcon from '@lucide/svelte/icons/folder-git-2';
	import { Button } from '@workbench/ui/button';
	import type { FolderBrowser } from '@workbench/control-plane-ui';

	/** A host's folders, one at a time: open one by clicking it, go up with the arrow. */
	let {
		browser,
		isProject
	}: {
		browser: FolderBrowser;
		/** Marks folders that are already projects. */
		isProject?: (path: string) => boolean;
	} = $props();

	let listing = $derived(browser.listing);
</script>

<div class="overflow-hidden rounded-md border border-wb-hair">
	<div class="flex items-center gap-1.5 border-b border-wb-hair px-1.5 py-1">
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="Up one folder"
			disabled={!listing?.parent || browser.loading}
			onclick={() => browser.open(listing?.parent ?? undefined)}
		>
			<ArrowUpIcon class="size-3.5" />
		</Button>
		<span class="min-w-0 flex-1 truncate font-mono text-xs text-wb-ink-soft">
			{listing?.path ?? '…'}
		</span>
	</div>
	<ul class="max-h-48 overflow-y-auto">
		{#each listing?.folders ?? [] as folder (folder.path)}
			<li>
				<button
					type="button"
					class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-wb-panel2"
					onclick={() => browser.open(folder.path)}
				>
					{#if folder.git}
						<FolderGitIcon class="size-3.5 shrink-0 text-wb-accent" />
					{:else}
						<FolderIcon class="size-3.5 shrink-0 text-wb-ink-soft" />
					{/if}
					<span class="min-w-0 flex-1 truncate">{folder.name}</span>
					{#if isProject?.(folder.path)}
						<span class="shrink-0 text-[11px] text-wb-ink-soft">Project</span>
					{/if}
				</button>
			</li>
		{:else}
			<li class="px-2.5 py-2 text-xs text-wb-ink-soft" role="status">
				{browser.loading ? 'Loading…' : 'No folders here.'}
			</li>
		{/each}
	</ul>
</div>
{#if browser.error}
	<p class="text-xs text-destructive" role="alert">{browser.error}</p>
{/if}
