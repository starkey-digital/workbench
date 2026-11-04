<script lang="ts">
	import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import InstanceSwitcher from './InstanceSwitcher.svelte';
	import RemoteHostBar from './RemoteHostBar.svelte';
	import RemoteProjectTree from './RemoteProjectTree.svelte';
	import type { RemoteInstance } from './instances.svelte';
	import { remoteSession } from './remote-session.svelte';

	let {
		instance,
		sidebarCollapsed,
		onToggleSidebar,
		onConnect
	}: {
		instance: RemoteInstance;
		sidebarCollapsed: boolean;
		onToggleSidebar: () => void;
		onConnect: (remote?: RemoteInstance) => void;
	} = $props();

	// Keyed by the instance in App, so this is its session for the component's life.
	// svelte-ignore state_referenced_locally
	const session = remoteSession(instance);
</script>

<aside class="flex h-full w-full flex-col overflow-hidden border-r border-wb-hair bg-wb-panel">
	<div class="flex h-[38px] shrink-0 items-center border-b border-wb-hair pr-2 pl-3">
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
			<button
				class="ml-auto flex h-6 items-center gap-1 rounded-md border border-wb-hair px-2 font-mono text-[11px] text-wb-ink-mute transition-colors hover:bg-wb-panel2 hover:text-wb-ink"
				type="button"
				onclick={() => {
					void instance.store.refresh();
					void session.loadAccounts();
				}}
			>
				<RefreshCwIcon class={['size-3', instance.store.loading && 'animate-spin']} />
				Refresh
			</button>
		{/if}
	</div>

	{#if !sidebarCollapsed}
		{#if instance.status === 'offline' && !instance.hostUpdate.updating}
			<div class="flex-1 px-3 py-8 text-center">
				<p class="font-mono text-[11px] text-wb-err">Offline</p>
				<p class="mt-1 font-mono text-[10.5px] break-all text-wb-ink-mute">
					Can't reach {instance.config.url}
				</p>
			</div>
		{:else if instance.status !== 'online'}
			<p class="flex-1 px-3 py-8 text-center font-mono text-[11px] text-wb-ink-mute">
				{instance.hostUpdate.updating ? 'Host restarting into its update…' : 'Connecting…'}
			</p>
		{:else}
			<RemoteProjectTree store={instance.store} {session} />
		{/if}
		<RemoteHostBar {session} update={instance.hostUpdate} />
	{/if}
</aside>
