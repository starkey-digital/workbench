<script lang="ts">
	import { Button } from '@workbench/ui/button';
	import type { HostUpdate } from '@workbench/control-plane-ui';

	/** The remote host's Workbench version, with Update (after a confirm) when one is available. */
	let { update }: { update: HostUpdate } = $props();

	let confirming = $state(false);
</script>

{#if update.status}
	{@const { current, available } = update.status}
	<div class="flex flex-col gap-1.5 border-b border-wb-hair px-3 py-2">
		<div class="flex items-center gap-2">
			<span class="min-w-0 flex-1 truncate font-mono text-[11px] text-wb-ink-soft">
				Workbench v{current}
			</span>
			{#if update.updating}
				<span class="animate-pulse text-[11px] font-medium text-wb-warn">Updating host…</span>
			{:else if available && !confirming}
				<Button size="sm" onclick={() => (confirming = true)}>Update to v{available}</Button>
			{:else if !available}
				<span class="text-[11px] text-wb-ink-mute">Up to date</span>
			{/if}
		</div>
		{#if confirming && available && !update.updating}
			<p class="text-[11px] text-wb-ink-mute">
				Every terminal and chat running on this host will end, then Workbench restarts on v{available}.
				Conversations stay on disk and can be resumed.
			</p>
			<div class="flex justify-end gap-1">
				<Button variant="ghost" size="sm" onclick={() => (confirming = false)}>Cancel</Button>
				<Button
					variant="destructive"
					size="sm"
					onclick={() => {
						confirming = false;
						void update.install();
					}}
				>
					End sessions and update
				</Button>
			</div>
		{/if}
		{#if update.error}
			<p role="alert" class="text-[11px] text-wb-err">{update.error}</p>
		{/if}
	</div>
{/if}
