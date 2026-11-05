<script lang="ts">
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import { AgentIcon } from '@workbench/ui/agent-icon';
	import type { MobileClient } from './client.svelte.ts';
	import Sheet from './Sheet.svelte';
	import { NewWorktreeFlow } from './worktree-flows.svelte.ts';

	/** A new worktree for `projectPath`: a new branch, or one that exists; optionally Claude in it. */
	let {
		client,
		projectPath,
		name,
		onClose
	}: { client: MobileClient; projectPath: string; name: string; onClose: () => void } = $props();

	// svelte-ignore state_referenced_locally
	const flow = new NewWorktreeFlow(client.store!, projectPath);

	async function create(startClaude: boolean) {
		const worktreePath = await flow.create();
		if (!worktreePath) return;
		onClose();
		if (startClaude) await client.start('claude', { projectPath, worktreePath });
	}

	const field =
		'h-10 w-full rounded-lg border border-wb-hair bg-wb-panel2 px-3 font-mono text-[13px] text-wb-ink placeholder:text-wb-ink-soft focus:border-wb-ink-soft focus:outline-none';
</script>

<Sheet label="New worktree in {name}" onClose={flow.busy ? undefined : onClose}>
	<form
		class="flex flex-col gap-3 text-sm"
		onsubmit={(e) => {
			e.preventDefault();
			void create(false);
		}}
	>
		<div class="flex items-center gap-2">
			<h2 class="min-w-0 flex-1 truncate font-semibold">New worktree</h2>
			<button
				type="button"
				class="h-9 rounded-lg border border-wb-hair px-3 text-xs disabled:opacity-50"
				disabled={flow.busy}
				onclick={onClose}>Cancel</button
			>
		</div>
		<p class="-mt-1 truncate text-xs text-wb-ink-mute">{name}</p>

		<div class="flex gap-1 rounded-lg bg-wb-panel2 p-0.5" role="tablist">
			{#each [['new', 'New branch'], ['existing', 'Existing branch']] as const as [mode, text] (mode)}
				<button
					type="button"
					role="tab"
					aria-selected={flow.mode === mode}
					class={[
						'h-8 flex-1 rounded-md text-[12.5px] font-medium',
						flow.mode === mode ? 'bg-wb-panel text-wb-ink shadow-sm' : 'text-wb-ink-soft'
					]}
					disabled={flow.busy}
					onclick={() => flow.setMode(mode)}>{text}</button
				>
			{/each}
		</div>

		{#if flow.mode === 'new'}
			<label class="flex flex-col gap-1.5 text-[12px] font-semibold text-wb-ink-mute"
				>Branch name
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class={field}
					bind:value={flow.name}
					placeholder="feature/my-change"
					autocapitalize="off"
					autocorrect="off"
					spellcheck={false}
					autofocus
					disabled={flow.busy}
				/>
			</label>
			<p class="text-[11.5px] text-wb-ink-soft">
				Branches off the host's default base (its worktree settings), in a folder of its own.
			</p>
		{:else if flow.branchesError}
			<div class="flex flex-col gap-2 rounded-lg border border-wb-err/40 bg-wb-err/10 p-3">
				<p class="font-mono text-[11px] break-all text-wb-err">{flow.branchesError}</p>
				<button
					type="button"
					class="h-8 self-start rounded-lg border border-wb-hair px-3 text-xs"
					onclick={() => flow.loadBranches()}>Retry</button
				>
			</div>
		{:else}
			<ul
				class="flex max-h-[40vh] flex-col overflow-y-auto rounded-lg border border-wb-hair-soft"
				aria-label="Branches"
			>
				{#each flow.free as b (b.name)}
					{@const picked = flow.existing === b.name}
					<li class="border-b border-wb-hair-soft last:border-b-0">
						<button
							type="button"
							class={[
								'flex min-h-11 w-full items-center gap-2.5 px-3 text-left active:bg-wb-panel2',
								picked && 'bg-wb-accent/10'
							]}
							aria-pressed={picked}
							disabled={flow.busy}
							onclick={() => (flow.existing = b.name)}
						>
							{#if b.remote}
								<CloudIcon class="size-3.5 shrink-0 text-wb-ink-soft" />
							{:else}
								<GitBranchIcon class="size-3.5 shrink-0 text-wb-ink-soft" />
							{/if}
							<span class="min-w-0 flex-1 truncate font-mono text-[12.5px]">{b.name}</span>
							{#if b.remote}<span class="shrink-0 text-[10.5px] text-wb-ink-soft">remote</span>{/if}
						</button>
					</li>
				{:else}
					<li class="px-3 py-3 text-xs text-wb-ink-soft" role="status">
						{flow.branchesLoading
							? 'Loading branches…'
							: 'Every branch is already checked out somewhere.'}
					</li>
				{/each}
			</ul>
		{/if}

		{#if flow.error}<p class="text-xs break-words text-wb-err" role="alert">{flow.error}</p>{/if}

		<div class="flex gap-2">
			<button
				type="submit"
				class="h-10 flex-1 rounded-lg border border-wb-hair bg-wb-panel2 text-[13px] font-medium active:bg-wb-panel disabled:opacity-50"
				disabled={!flow.branch || flow.busy}
			>
				{flow.busy ? 'Creating…' : 'Create'}
			</button>
			<button
				type="button"
				class="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-wb-accent text-[13px] font-semibold text-wb-accent-ink active:brightness-90 disabled:opacity-50"
				disabled={!flow.branch || flow.busy || !!client.screens.starting}
				onclick={() => create(true)}
			>
				<AgentIcon agent="claude" class="size-3.5" />Create + Claude
			</button>
		</div>
	</form>
</Sheet>
