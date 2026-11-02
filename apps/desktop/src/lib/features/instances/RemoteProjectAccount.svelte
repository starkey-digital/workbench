<script lang="ts">
	import { AgentIcon } from '@workbench/ui/agent-icon';
	import * as DropdownMenu from '@workbench/ui/dropdown-menu';
	import CheckIcon from '@lucide/svelte/icons/check';
	import type { ProjectConfig } from '$types/workbench';
	import type { RemoteSession } from './remote-session.svelte';

	/** The project's Claude account on the host: its own pick, or the host's (shown only on hover). */
	let { project, session }: { project: ProjectConfig; session: RemoteSession } = $props();

	const picked = $derived(project.claudeAccountId);
	// An id the host no longer lists (account removed) still shows, as launches skip it.
	const pickedName = $derived(
		picked === undefined
			? undefined
			: (session.accountChoices.find((a) => a.id === picked)?.name ?? `${picked} (removed)`)
	);
	const choices = $derived([
		{ id: undefined, name: `Host's account (${session.activeAccountName})` },
		...session.accountChoices
	]);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={[
			'flex h-5 max-w-24 shrink-0 items-center gap-1 rounded px-1 font-mono text-[10px] text-wb-ink-mute transition-opacity hover:bg-wb-panel2 hover:text-wb-ink focus-visible:opacity-100 data-[state=open]:opacity-100',
			!pickedName && 'opacity-0 group-hover:opacity-100'
		]}
		aria-label="Claude account for {project.name}"
		title="Claude account for new sessions in {project.name}"
	>
		<AgentIcon agent="claude" class="size-2.5 shrink-0" />
		{#if pickedName}<span class="truncate">{pickedName}</span>{/if}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="min-w-52" align="end">
		<DropdownMenu.Label class="text-xs text-wb-ink-soft">
			New Claude sessions in {project.name} use
		</DropdownMenu.Label>
		{#each choices as choice, i (choice.id ?? ':host')}
			{#if i === 1}<DropdownMenu.Separator />{/if}
			<DropdownMenu.Item
				onSelect={() => choice.id !== picked && void session.setProjectAccount(project, choice.id)}
			>
				<CheckIcon class={['size-3.5', choice.id !== picked && 'invisible']} />
				<span class="truncate">{choice.name}</span>
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
