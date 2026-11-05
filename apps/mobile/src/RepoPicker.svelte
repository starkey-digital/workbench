<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import LockIcon from '@lucide/svelte/icons/lock';
	import SearchIcon from '@lucide/svelte/icons/search';
	import type { NewProjectFlow } from '@workbench/control-plane-ui';

	/** What to clone: a repo from the host's `gh` login, or a typed URL / `owner/repo`. Picking one
	 *  clears the typed text and typing clears the pick. */
	let { flow }: { flow: NewProjectFlow } = $props();

	let search = $state('');
	const repos = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return q
			? flow.repos.filter(
					(r) =>
						r.nameWithOwner.toLowerCase().includes(q) ||
						(r.description ?? '').toLowerCase().includes(q)
				)
			: flow.repos;
	});

	const field =
		'h-10 w-full rounded-lg border border-wb-hair bg-wb-panel2 px-3 text-[13.5px] text-wb-ink placeholder:text-wb-ink-soft focus:border-wb-ink-soft focus:outline-none';
</script>

<div class="flex flex-col gap-2">
	{#if flow.reposError}
		<div class="flex flex-col gap-2 rounded-lg border border-wb-err/40 bg-wb-err/10 p-3">
			<p class="text-xs font-medium text-wb-err">Couldn't list the host's GitHub repositories</p>
			<p class="font-mono text-[11px] break-all text-wb-ink-mute">{flow.reposError}</p>
			<button
				type="button"
				class="h-8 self-start rounded-lg border border-wb-hair px-3 text-xs"
				onclick={() => flow.loadRepos()}>Retry</button
			>
		</div>
	{:else}
		<div
			class="flex h-10 items-center gap-2 rounded-lg border border-wb-hair bg-wb-panel2 px-3 text-wb-ink-soft focus-within:border-wb-ink-soft"
		>
			<SearchIcon class="size-4 shrink-0" />
			<input
				bind:value={search}
				type="search"
				aria-label="Search repositories"
				placeholder={flow.reposLoading
					? 'Loading repositories…'
					: `Search ${flow.repos.length} repositories`}
				autocapitalize="off"
				autocorrect="off"
				spellcheck={false}
				class="min-w-0 flex-1 bg-transparent text-[13.5px] text-wb-ink placeholder:text-wb-ink-soft focus:outline-none"
			/>
		</div>
		<ul
			class="flex max-h-[28vh] flex-col overflow-y-auto rounded-lg border border-wb-hair-soft"
			aria-label="Repositories"
		>
			{#each repos as repo (repo.nameWithOwner)}
				{@const picked = flow.repo?.nameWithOwner === repo.nameWithOwner}
				<li class="border-b border-wb-hair-soft last:border-b-0">
					<button
						type="button"
						class={[
							'flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left active:bg-wb-panel2',
							picked && 'bg-wb-accent/10'
						]}
						aria-pressed={picked}
						onclick={() => {
							flow.repo = picked ? null : repo;
							flow.url = '';
						}}
					>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="flex items-center gap-1.5 truncate font-mono text-[12.5px]">
								{repo.nameWithOwner}
								{#if repo.isPrivate}<LockIcon class="size-3 shrink-0 text-wb-ink-soft" />{/if}
							</span>
							{#if repo.description}
								<span class="truncate text-[11px] text-wb-ink-soft">{repo.description}</span>
							{/if}
						</span>
						{#if picked}<CheckIcon class="size-4 shrink-0 text-wb-accent" />{/if}
					</button>
				</li>
			{:else}
				<li class="px-3 py-3 text-xs text-wb-ink-soft" role="status">
					{flow.reposLoading
						? 'Loading…'
						: search
							? `No repositories match “${search}”.`
							: 'No repositories.'}
				</li>
			{/each}
		</ul>
	{/if}
	<input
		class={field}
		value={flow.url}
		oninput={(e) => {
			flow.url = e.currentTarget.value;
			flow.repo = null;
		}}
		aria-label="Repository URL or owner/repo"
		placeholder="Or a URL, or owner/repo"
		autocapitalize="off"
		autocorrect="off"
		spellcheck={false}
	/>
</div>
