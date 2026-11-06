<script lang="ts">
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import GitForkIcon from '@lucide/svelte/icons/git-fork';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { Button } from '@workbench/ui/button';
	import { Input } from '@workbench/ui/input';
	import { Label } from '@workbench/ui/label';
	import { Badge } from '@workbench/ui/badge';
	import { Separator } from '@workbench/ui/separator';
	import { ScrollArea } from '@workbench/ui/scroll-area';
	import type { GitHubRepo } from '$types/workbench';

	/** A repository to clone: picked from a `gh` login's list, or typed. Picking one clears the
	 *  typed text and typing clears the pick. */
	let {
		repos,
		loading,
		error,
		onretry,
		selected = $bindable(null),
		typed = $bindable('')
	}: {
		repos: GitHubRepo[];
		loading: boolean;
		error: string | null;
		onretry: () => void;
		selected?: GitHubRepo | null;
		typed?: string;
	} = $props();

	let search = $state('');

	let filtered = $derived.by(() => {
		const q = search.toLowerCase();
		if (!q) return repos;
		return repos.filter(
			(r) =>
				r.nameWithOwner.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
		);
	});
</script>

<div class="flex flex-col gap-2">
	<Label class="text-xs text-muted-foreground">Repositories</Label>
	<div class="relative">
		<SearchIcon class="absolute top-2 left-2.5 size-3.5 text-muted-foreground" />
		<Input class="h-8 pl-8 text-xs" placeholder="Search repositories…" bind:value={search} />
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-6">
			<LoaderIcon class="size-4 animate-spin text-muted-foreground" />
		</div>
	{:else if error}
		<div class="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
			<p class="text-xs font-medium text-destructive">Failed to load repositories</p>
			<p class="font-mono text-[11px] break-all text-muted-foreground">{error}</p>
			<Button variant="outline" size="sm" class="h-7 text-xs" onclick={onretry}>Retry</Button>
		</div>
	{:else}
		<ScrollArea class="h-48 rounded-md border">
			<div class="divide-y">
				{#each filtered as repo (repo.nameWithOwner)}
					<button
						class={[
							'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50',
							selected?.nameWithOwner === repo.nameWithOwner && 'bg-accent'
						]}
						type="button"
						onclick={() => {
							selected = repo;
							typed = '';
						}}
					>
						<div class="min-w-0 flex-1">
							<span class="font-medium">{repo.nameWithOwner}</span>
							{#if repo.description}
								<span class="ml-1.5 truncate text-muted-foreground">{repo.description}</span>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-1">
							{#if repo.isPrivate}
								<Badge variant="outline" class="h-4 px-1 text-[9px]">Private</Badge>
							{/if}
							{#if repo.isFork}
								<GitForkIcon class="size-3 text-muted-foreground/60" />
							{/if}
						</div>
					</button>
				{:else}
					<p class="px-3 py-4 text-center text-xs text-muted-foreground">
						{search ? 'No matching repositories' : 'No repositories found'}
					</p>
				{/each}
			</div>
		</ScrollArea>
	{/if}
</div>

<div class="flex items-center gap-3">
	<Separator class="flex-1" />
	<span class="shrink-0 text-[10px] text-muted-foreground uppercase">or enter URL / owner/repo</span
	>
	<Separator class="flex-1" />
</div>

<Input
	class="h-8 text-xs"
	placeholder="https://github.com/owner/repo  or  owner/repo"
	bind:value={typed}
	oninput={() => (selected = null)}
/>
