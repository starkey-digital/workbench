<script lang="ts">
	import { AgentIcon } from '@workbench/ui/agent-icon';
	import CheckIcon from '@lucide/svelte/icons/check';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
	import XIcon from '@lucide/svelte/icons/x';
	import type { AgentKind, ApprovalDecision } from '@workbench/types';
	import { agentName, type ApprovalItem } from './chat-format';
	import { getRunCommand } from './run-command';

	/**
	 * A command Claude asks the person to run (the plugin's `run_in_terminal`):
	 * Run opens it in a new terminal, then Done or Skip answers the call, so
	 * Claude carries on by itself.
	 */
	let {
		approval,
		command,
		reason,
		agent = 'claude',
		onDecide
	}: {
		approval: ApprovalItem;
		command: string;
		reason?: string;
		agent?: AgentKind;
		onDecide: (decision: ApprovalDecision) => void;
	} = $props();

	const run = getRunCommand();
	let ran = $state(false);
	/** Disables the buttons between a click and the server's confirmation. */
	let sent = $state<ApprovalDecision | null>(null);

	const outcome = $derived(
		approval.expired
			? `Withdrawn by ${agentName(agent)}`
			: approval.decision === 'deny'
				? 'Skipped'
				: approval.decision
					? 'Done'
					: null
	);

	function decide(decision: ApprovalDecision) {
		sent = decision;
		onDecide(decision);
	}
</script>

{#if outcome}
	<div class="flex min-w-0 items-center gap-2 text-xs text-wb-ink-soft">
		{#if approval.decision === 'deny' || approval.expired}
			<XIcon class="size-3.5 shrink-0" />
		{:else}
			<CheckIcon class="size-3.5 shrink-0 text-wb-ok" />
		{/if}
		<span class="shrink-0">{outcome}</span>
		<span class="min-w-0 truncate font-mono text-[11px]">{command}</span>
	</div>
{:else}
	<section
		class="request overflow-hidden rounded-lg border border-wb-warn/45 bg-wb-panel"
		aria-label="Command to run"
	>
		<header class="flex items-center gap-2 px-3.5 pt-3 text-sm">
			<AgentIcon {agent} class="size-4" />
			<span class="font-medium text-wb-ink">Run this in a terminal</span>
		</header>
		{#if reason}<p class="px-3.5 pt-1 text-xs text-wb-ink-mute">{reason}</p>{/if}
		<pre
			class="command scrollbar-thin mx-3.5 mt-2.5 max-h-48 overflow-auto rounded-md border border-wb-hair bg-wb-bg px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap text-wb-ink">{command}</pre>
		<div class="flex flex-wrap items-center gap-2 px-3.5 py-3">
			{#if run}
				<button
					type="button"
					class={[
						'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs focus-visible:ring-2 focus-visible:ring-wb-accent/50 focus-visible:outline-none disabled:opacity-50',
						ran
							? 'border border-wb-hair bg-wb-panel2 text-wb-ink hover:border-wb-ink-soft'
							: 'bg-wb-accent font-semibold text-wb-accent-ink hover:brightness-110'
					]}
					disabled={sent !== null}
					onclick={() => {
						run(command);
						ran = true;
					}}
				>
					<SquareTerminalIcon class="size-3.5" />
					{ran ? 'Run again' : 'Run in terminal'}
				</button>
			{/if}
			<button
				type="button"
				class={[
					'rounded-md px-3 py-1 text-xs focus-visible:ring-2 focus-visible:ring-wb-accent/50 focus-visible:outline-none disabled:opacity-50',
					ran || !run
						? 'bg-wb-accent font-semibold text-wb-accent-ink hover:brightness-110'
						: 'border border-wb-hair bg-wb-panel2 text-wb-ink hover:border-wb-ink-soft'
				]}
				disabled={sent !== null}
				onclick={() => decide('allow')}
			>
				{sent === 'allow' ? 'Sending…' : 'Done'}
			</button>
			<button
				type="button"
				class="ml-auto rounded-md px-3 py-1 text-xs text-wb-ink-mute hover:text-wb-err focus-visible:ring-2 focus-visible:ring-wb-accent/50 focus-visible:outline-none disabled:opacity-50"
				disabled={sent !== null}
				onclick={() => decide('deny')}
			>
				Skip
			</button>
		</div>
	</section>
{/if}

<style>
	/* Arrives with a short lift so a request that lands mid-scroll is noticed. */
	.request {
		animation: arrive 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
		box-shadow: 0 0 0 3px color-mix(in oklab, var(--wb-warn) 10%, transparent);
	}
	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}
	.command::before {
		content: '$ ';
		color: var(--wb-ink-soft);
	}
	@media (prefers-reduced-motion: reduce) {
		.request {
			animation: none;
		}
	}
</style>
