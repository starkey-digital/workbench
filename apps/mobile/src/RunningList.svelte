<script lang="ts">
	import { AgentIcon } from '@workbench/ui/agent-icon';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
	import XIcon from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';
	import { Elapsed, shortPath } from '@workbench/chat-ui';
	import { cn } from '@workbench/ui';
	import type { RunningTasks } from '@workbench/types';
	import type { MobileClient } from './client.svelte.ts';
	import { age } from './home-format.ts';
	import { paneTitle, workspaceLabel, type PaneEntry } from './panes.ts';

	/** Home's Running section: the host's workspaces, their sessions, and closing them. */
	let {
		client,
		now,
		sectionTitle,
		runningTasks
	}: {
		client: MobileClient;
		/** For relative times. */
		now: number;
		sectionTitle: Snippet<[string, number?, boolean?]>;
		runningTasks: Snippet<[RunningTasks | undefined]>;
	} = $props();

	/** The host's workspaces as it orders them, each with its panes; an empty one shows so it can be closed. */
	const running = $derived(
		(client.remote?.workspaces ?? [])
			.map((workspace) => ({
				workspace,
				entries: client.panes.filter((e) => e.workspace === workspace && !e.pane.waiting),
				/** Every pane, waiting ones included: what closing it ends. */
				sessions: client.panes.filter((e) => e.workspace === workspace).length
			}))
			.filter((group) => group.entries.length > 0 || group.sessions === 0)
	);
	const runningCount = $derived(running.reduce((n, group) => n + group.entries.length, 0));
	/** The workspace whose close is being confirmed. */
	let closing = $state<string | null>(null);

	function activity({ pane, workspace }: PaneEntry): string {
		if (pane.status === 'needsTrust') return 'Needs folder trust';
		if (pane.status === 'starting') return 'Starting';
		if (pane.status === 'exited') return 'Exited';
		if (pane.kind === 'shell') return 'Terminal';
		if (pane.running)
			return (
				shortPath(pane.running.detail, workspace.worktreePath ?? workspace.projectPath) ||
				pane.running.name
			);
		return pane.busy ? 'Thinking' : 'Your turn';
	}
</script>

{#if running.length > 0}
	<section class="flex flex-col gap-2">
		{@render sectionTitle('Running', runningCount)}
		{#each running as group (group.workspace.id)}
			{@const wsLabel = workspaceLabel(group.workspace)}
			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-1 pt-1 pl-0.5">
					<h3 class="min-w-0 flex-1 truncate font-mono text-[11px] text-wb-ink-mute">
						{wsLabel}
					</h3>
					<button
						type="button"
						class="grid size-8 shrink-0 place-items-center rounded-lg text-wb-ink-soft active:bg-wb-panel2 active:text-wb-err"
						aria-label="Close workspace {wsLabel}"
						aria-expanded={closing === group.workspace.id}
						onclick={() => (closing = closing === group.workspace.id ? null : group.workspace.id)}
					>
						<XIcon class="size-3.5" />
					</button>
				</div>
				{#if closing === group.workspace.id}
					<div class="flex flex-col gap-2 rounded-xl border border-wb-err/40 p-3">
						<p class="text-xs text-wb-ink-mute">
							{group.sessions === 0
								? `Close ${wsLabel}? It has nothing open.`
								: `Close ${wsLabel}? Its ${group.sessions === 1 ? 'session ends' : `${group.sessions} sessions end`} on every device. Files and history stay.`}
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								class="h-9 flex-1 rounded-lg bg-wb-err/15 text-[13px] font-semibold text-wb-err"
								onclick={() => {
									closing = null;
									void client.closeWorkspace(group.workspace.id);
								}}>Close workspace</button
							>
							<button
								type="button"
								class="h-9 flex-1 rounded-lg border border-wb-hair text-[13px] text-wb-ink-mute"
								onclick={() => (closing = null)}>Keep</button
							>
						</div>
					</div>
				{/if}
				{#if group.sessions === 0}
					<p class="px-0.5 text-xs text-wb-ink-soft">Open on the host, with no sessions.</p>
				{/if}
				{#each group.entries as entry (entry.pane.id)}
					{@const pane = entry.pane}
					{@const title = paneTitle(entry)}
					<div
						class="flex items-center gap-2.5 rounded-xl border border-wb-hair-soft bg-wb-panel py-2.5 pr-1.5 pl-3"
					>
						<button
							type="button"
							class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
							onclick={() => client.openPane(pane.id)}
						>
							<span
								class={cn(
									'grid size-8 shrink-0 place-items-center rounded-lg bg-wb-panel2',
									pane.kind === 'codex'
										? 'text-wb-codex'
										: pane.kind === 'claude'
											? 'text-wb-claude'
											: 'text-wb-shell'
								)}
							>
								{#if pane.kind === 'shell'}
									<SquareTerminalIcon class="size-4" />
								{:else}
									<AgentIcon agent={pane.kind} class="size-4" />
								{/if}
							</span>
							<span class="flex min-w-0 flex-col">
								<span class="truncate text-[13.5px] font-medium">{title}</span>
								<span
									class={cn(
										'truncate text-[11.5px] text-wb-ink-mute',
										pane.running && 'font-mono text-[11px] text-wb-ink'
									)}>{activity(entry)}</span
								>
								{@render runningTasks(pane.runningTasks)}
							</span>
							<span
								class="ml-auto flex shrink-0 flex-col items-end gap-1 font-mono text-[11px] text-wb-ink-soft"
							>
								{#if pane.busy && pane.busySince}
									<span class="spinner size-3"></span>
									<Elapsed since={pane.busySince} />
								{:else if pane.turnEndedAt}
									{age(pane.turnEndedAt, now)}
								{/if}
							</span>
						</button>
						<!-- Ending a Claude or Codex session is in its chat's menu, not one stray tap away. -->
						{#if pane.kind === 'shell'}
							<button
								type="button"
								class="grid size-8 shrink-0 place-items-center rounded-lg text-wb-ink-soft active:bg-wb-panel2 active:text-wb-err"
								aria-label="Close {title}"
								onclick={() => client.endPane(pane.id)}
							>
								<XIcon class="size-4" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</section>
{/if}
