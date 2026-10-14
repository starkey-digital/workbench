<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { getWorkspaceStore } from '$stores/context';

	const workspaceStore = getWorkspaceStore();
	const persistence = $derived(workspaceStore.persistence);
</script>

<!-- The snapshot stream is down: busy, waiting and tabs may be out of date until it's back. -->
{#if !workspaceStore.streamLive}
	<div
		class="flex shrink-0 items-center gap-2 border-b border-wb-hair bg-wb-panel px-3 py-1 text-xs text-wb-ink-mute"
		role="status"
	>
		<LoaderCircleIcon class="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
		<span>Reconnecting to the workspace server…</span>
	</div>
{/if}
<!-- Stays while the server can't save the workspaces: tabs opened now are lost on quit. -->
{#if persistence.status !== 'ok'}
	<div
		class="flex shrink-0 items-start gap-2 border-b border-wb-hair bg-wb-warn/10 px-3 py-1.5 text-xs text-wb-ink"
		role="alert"
	>
		<TriangleAlertIcon class="mt-px size-3.5 shrink-0 text-wb-warn" />
		<span>
			<span class="font-medium">Tabs aren't being saved.</span>
			{persistence.message ??
				(persistence.status === 'locked'
					? 'Another Workbench server is using this config folder.'
					: "The saved workspaces couldn't be read.")}
		</span>
	</div>
{/if}
