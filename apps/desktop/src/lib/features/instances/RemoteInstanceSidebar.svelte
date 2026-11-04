<script lang="ts">
	import PanelLeftOpenIcon from '@lucide/svelte/icons/panel-left-open';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import InstanceSwitcher from './InstanceSwitcher.svelte';
	import RemoteNewProjectDialog from './RemoteNewProjectDialog.svelte';
	import { NewProjectFlow } from './new-project.svelte';
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

	/** The open "New project" dialog's flow, made fresh each time it opens. */
	let newProject = $state.raw<NewProjectFlow | null>(null);
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
				class="ml-auto flex h-6 items-center gap-1 rounded-md border border-wb-hair px-2 font-mono text-[11px] text-wb-ink-mute transition-colors hover:bg-wb-panel2 hover:text-wb-ink disabled:opacity-50"
				type="button"
				title="New project on this server"
				disabled={instance.status !== 'online'}
				onclick={() =>
					(newProject = new NewProjectFlow(instance.store, instance.config.copyFolder))}
			>
				<PlusIcon class="size-3" />
				Project
			</button>
			<button
				class="ml-1.5 flex h-6 items-center gap-1 rounded-md border border-wb-hair px-2 font-mono text-[11px] text-wb-ink-mute transition-colors hover:bg-wb-panel2 hover:text-wb-ink"
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

{#if newProject}
	<RemoteNewProjectDialog
		flow={newProject}
		server={instance.config.name}
		onclose={() => (newProject = null)}
	/>
{/if}
