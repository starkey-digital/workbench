<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SidebarHeader, {
		headerActionClass,
		headerIconClass
	} from '$features/chrome/SidebarHeader.svelte';
	import RemoteNewProjectDialog from './RemoteNewProjectDialog.svelte';
	import { NewProjectFlow } from '@workbench/control-plane-ui';
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
	<SidebarHeader {sidebarCollapsed} {onToggleSidebar} {onConnect}>
		{#snippet actions()}
			<button
				class={headerActionClass}
				type="button"
				title="Add a project on this server"
				disabled={instance.status !== 'online'}
				onclick={() =>
					(newProject = new NewProjectFlow(instance.store, instance.config.copyFolder))}
			>
				<PlusIcon class="size-3" />
				Add
			</button>
			<button
				class={headerIconClass}
				type="button"
				title="Refresh"
				aria-label="Refresh"
				onclick={() => {
					void instance.store.refresh();
					void session.loadAccounts();
				}}
			>
				<RefreshCwIcon class={['size-3', instance.store.loading && 'animate-spin']} />
			</button>
		{/snippet}
	</SidebarHeader>

	{#if !sidebarCollapsed}
		{#if instance.status === 'offline' && !instance.hostUpdate.updating}
			<div class="flex-1 px-3 py-8 text-center">
				<p class="font-mono text-[11px] text-wb-err">Offline</p>
				<p class="mt-1 font-mono text-[11px] break-all text-wb-ink-mute">
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
