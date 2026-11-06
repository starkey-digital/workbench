<script module lang="ts">
	/** Classes for a labelled header action (icon + short word), e.g. "Add". */
	export const headerActionClass =
		'flex h-6 shrink-0 items-center gap-1 rounded-md border border-wb-hair px-2 font-mono text-[11px] text-wb-ink-mute transition-colors hover:bg-wb-panel2 hover:text-wb-ink disabled:opacity-50';
	/** Classes for an icon-only header action; give it an `aria-label` and `title`. */
	export const headerIconClass =
		'flex size-6 shrink-0 items-center justify-center rounded-md text-wb-ink-mute transition-colors hover:bg-wb-panel2 hover:text-wb-ink disabled:opacity-50';
</script>

<script lang="ts">
	import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';
	import type { Snippet } from 'svelte';
	import InstanceSwitcher from '../instances/InstanceSwitcher.svelte';
	import type { RemoteInstance } from '../instances/instances.svelte';

	let {
		sidebarCollapsed,
		onToggleSidebar,
		onConnect,
		actions
	}: {
		sidebarCollapsed: boolean;
		onToggleSidebar: () => void;
		onConnect: (remote?: RemoteInstance) => void;
		/** Right-aligned header buttons. */
		actions: Snippet;
	} = $props();
</script>

<div class="flex h-[38px] shrink-0 items-center gap-1 border-b border-wb-hair pr-2 pl-3">
	{#if sidebarCollapsed}
		<button
			class="mx-auto flex size-[22px] items-center justify-center rounded text-wb-ink-mute transition-colors hover:bg-wb-panel2 hover:text-wb-ink"
			type="button"
			aria-label="Expand sidebar"
			onclick={onToggleSidebar}
		>
			<PanelLeftOpenIcon class="size-3" />
		</button>
	{:else}
		<InstanceSwitcher {onConnect} />
		<div class="ml-auto flex items-center gap-1">
			{@render actions()}
		</div>
	{/if}
</div>
