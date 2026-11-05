<script lang="ts">
	import type { WorktreeInfo } from '@workbench/types';
	import type { MobileClient } from './client.svelte.ts';
	import { baseName, tildePath } from './home-format.ts';
	import Sheet from './Sheet.svelte';
	import { WorktreeRemoval } from './worktree-flows.svelte.ts';

	/** Confirms removing a worktree: its folder, optionally its branch, and the sessions in it. */
	let {
		client,
		projectPath,
		worktree,
		onClose
	}: {
		client: MobileClient;
		projectPath: string;
		worktree: WorktreeInfo;
		onClose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	const removal = new WorktreeRemoval(client.store!, projectPath, worktree, (path) =>
		client.closeWorktreeWorkspaces(path)
	);
	const label = $derived(worktree.branch || baseName(worktree.path));
	const sessions = $derived(
		client.panes.filter((e) => e.workspace.worktreePath === worktree.path).length
	);

	async function remove() {
		if ((await removal.remove()) && !removal.done?.branchKept) onClose();
	}
</script>

<Sheet label="Remove worktree {label}" onClose={removal.busy ? undefined : onClose}>
	<div class="flex flex-col gap-3 text-sm">
		<div class="flex items-center gap-2">
			<h2 class="min-w-0 flex-1 truncate font-semibold">
				{removal.done ? 'Worktree removed' : 'Remove worktree'}
			</h2>
			<button
				type="button"
				class="h-9 rounded-lg border border-wb-hair px-3 text-xs disabled:opacity-50"
				disabled={removal.busy}
				onclick={onClose}>{removal.done ? 'Done' : 'Cancel'}</button
			>
		</div>
		<div class="flex flex-col gap-0.5 rounded-lg border border-wb-hair-soft bg-wb-panel2 p-3">
			<span class="truncate font-mono text-[13px]">{label}</span>
			<span class="truncate font-mono text-[11px] text-wb-ink-soft">{tildePath(worktree.path)}</span
			>
		</div>

		{#if removal.done}
			<p class="text-xs text-wb-ink-mute" role="status">
				Kept branch <span class="font-mono">{worktree.branch}</span>: it has commits that aren't
				merged, or it's checked out somewhere else.
			</p>
		{:else}
			<ul class="flex list-disc flex-col gap-1 pl-5 text-xs text-wb-ink-mute">
				<li>The folder is deleted from the host.</li>
				{#if sessions > 0}
					<li class="text-wb-warn">
						{sessions === 1 ? '1 session' : `${sessions} sessions`} open in it will end, on every device.
					</li>
				{/if}
			</ul>
			{#if worktree.branch}
				<label class="flex min-h-10 items-start gap-2.5 text-[13px]">
					<input
						type="checkbox"
						class="mt-0.5 size-4 shrink-0 accent-wb-accent"
						bind:checked={removal.deleteBranch}
						disabled={removal.busy}
					/>
					<span class="flex flex-col gap-0.5">
						<span>Also delete branch <span class="font-mono">{worktree.branch}</span></span>
						<span class="text-[11.5px] text-wb-ink-soft"
							>Only if it's merged: unmerged commits keep it.</span
						>
					</span>
				</label>
			{/if}
			{#if removal.error}
				<p class="text-xs break-words text-wb-err" role="alert">{removal.error}</p>
			{/if}
			{#if removal.needsForce}
				<p class="text-xs text-wb-ink-mute">
					It has changes that aren't committed. Removing it anyway deletes them for good.
				</p>
			{/if}
			<button
				type="button"
				class="h-10 rounded-lg bg-wb-err/15 text-[13px] font-semibold text-wb-err active:bg-wb-err/25 disabled:opacity-50"
				disabled={removal.busy}
				onclick={remove}
			>
				{removal.busy ? 'Removing…' : removal.needsForce ? 'Remove anyway' : 'Remove worktree'}
			</button>
		{/if}
	</div>
</Sheet>
