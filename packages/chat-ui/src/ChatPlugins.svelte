<script lang="ts">
	import PlugIcon from '@lucide/svelte/icons/plug';
	import XIcon from '@lucide/svelte/icons/x';
	import { Switch } from '@workbench/ui/switch';
	import type { PluginManager } from './plugin-manager.svelte';

	let {
		manager,
		busyTurn,
		onRestart,
		onClose
	}: {
		manager: PluginManager;
		/** A turn is running: a restart would end it. */
		busyTurn: boolean;
		/** Restart the session's `claude` so it loads the changes; false when it couldn't be sent. */
		onRestart: () => boolean;
		onClose: () => void;
	} = $props();

	/** The plugin whose Uninstall was pressed once and waits for the second press. */
	let confirming = $state<string | null>(null);

	const installedCount = $derived(manager.list.installed.length);

	function uninstall(id: string) {
		const plugin = manager.list.installed.find((p) => p.id === id);
		if (!plugin) return;
		if (confirming !== id) {
			confirming = id;
			return;
		}
		confirming = null;
		void manager.uninstall(plugin);
	}

	function restart() {
		// Not connected: keep the banner so the restart can be tried again.
		if (onRestart()) manager.needsRestart = false;
	}

	const secondary =
		'rounded-md border border-wb-hair bg-wb-panel2 px-2.5 py-1 text-xs text-wb-ink hover:border-wb-ink-soft focus-visible:ring-2 focus-visible:ring-wb-accent/50 focus-visible:outline-none disabled:opacity-50';
	const primary =
		'rounded-md bg-wb-accent px-3 py-1 text-xs font-semibold text-wb-accent-ink hover:brightness-110 focus-visible:ring-2 focus-visible:ring-wb-accent/50 focus-visible:outline-none disabled:opacity-50';
</script>

<section
	class="flex max-h-[60vh] w-full flex-col rounded-lg border border-wb-hair bg-wb-panel text-sm"
	aria-label="Plugins"
>
	<header class="flex items-center gap-2 px-3.5 pt-3">
		<PlugIcon class="size-4 shrink-0 text-wb-ink-mute" aria-hidden="true" />
		<span class="font-medium text-wb-ink">Plugins</span>
		<span class="text-xs text-wb-ink-mute tabular-nums">{installedCount} installed</span>
		<button
			type="button"
			class="ml-auto rounded p-1 text-wb-ink-mute hover:bg-wb-panel2 hover:text-wb-ink focus-visible:ring-1 focus-visible:ring-wb-accent focus-visible:outline-none"
			aria-label="Close plugins"
			onclick={onClose}
		>
			<XIcon class="size-4" />
		</button>
	</header>

	{#if manager.needsRestart}
		<div
			class="mx-3.5 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-wb-accent/40 bg-wb-accent-soft px-3 py-2 text-xs text-wb-ink"
			role="status"
		>
			<span class="min-w-0 flex-1">
				{busyTurn
					? 'Changes apply after a restart. Restarting now ends the running turn.'
					: 'Restart the chat to load your plugin changes.'}
			</span>
			<button type="button" class={primary} onclick={restart}>Restart chat</button>
		</div>
	{/if}

	{#if manager.error}
		<p class="mx-3.5 mt-2 text-xs text-wb-err" role="alert">{manager.error}</p>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto px-3.5 pt-2 pb-3" aria-busy={manager.loading}>
		{#if manager.loading && installedCount === 0}
			<p class="py-2 text-xs text-wb-ink-mute">Loading plugins…</p>
		{:else if installedCount === 0}
			<p class="py-2 text-xs text-wb-ink-mute">No plugins installed for this folder yet.</p>
		{/if}
		<ul class="flex flex-col divide-y divide-wb-hair-soft">
			{#each manager.list.installed as plugin (`${plugin.scope}:${plugin.id}`)}
				<li class="flex items-start gap-3 py-2">
					<div class="min-w-0 flex-1">
						<p class="flex items-baseline gap-1.5">
							<span class="truncate font-medium text-wb-ink">{plugin.id.split('@')[0]}</span>
							{#if plugin.version}
								<span class="shrink-0 text-[11px] text-wb-ink-soft">{plugin.version}</span>
							{/if}
							{#if plugin.scope !== 'user'}
								<span
									class="shrink-0 rounded bg-wb-panel2 px-1 text-[10px] text-wb-ink-mute uppercase"
								>
									{plugin.scope}
								</span>
							{/if}
						</p>
						{#if plugin.description}
							<p class="line-clamp-2 text-xs text-wb-ink-mute">{plugin.description}</p>
						{/if}
						<div class="mt-1 flex gap-1.5">
							<button
								type="button"
								class={secondary}
								disabled={manager.busy !== null}
								onclick={() => manager.update(plugin)}
							>
								Update
							</button>
							<button
								type="button"
								class={[secondary, confirming === plugin.id && 'border-wb-err text-wb-err']}
								disabled={manager.busy !== null}
								onclick={() => uninstall(plugin.id)}
							>
								{confirming === plugin.id ? 'Confirm uninstall' : 'Uninstall'}
							</button>
							{#if manager.busy === plugin.id}
								<span class="self-center text-[11px] text-wb-ink-mute">Working…</span>
							{/if}
						</div>
					</div>
					<Switch
						class="mt-0.5"
						bind:checked={() => plugin.enabled, () => void manager.toggle(plugin)}
						disabled={manager.busy !== null}
						aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.id}`}
					/>
				</li>
			{/each}
		</ul>

		<h3 class="mt-3 mb-1.5 text-xs font-medium text-wb-ink-mute">Add from marketplaces</h3>
		<input
			type="search"
			class="w-full rounded-md border border-wb-hair bg-wb-panel2 px-2.5 py-1.5 text-xs text-wb-ink placeholder:text-wb-ink-soft focus-visible:ring-1 focus-visible:ring-wb-accent focus-visible:outline-none"
			placeholder="Search plugins"
			aria-label="Search marketplace plugins"
			value={manager.query}
			oninput={(e) => manager.search(e.currentTarget.value)}
		/>
		<ul class="mt-1 flex flex-col divide-y divide-wb-hair-soft">
			{#each manager.list.available as plugin (plugin.id)}
				<li class="flex items-start gap-3 py-2">
					<div class="min-w-0 flex-1">
						<p class="flex items-baseline gap-1.5">
							<span class="truncate font-medium text-wb-ink">{plugin.name}</span>
							<span class="shrink-0 truncate text-[11px] text-wb-ink-soft">
								{plugin.marketplace}
							</span>
						</p>
						{#if plugin.description}
							<p class="line-clamp-2 text-xs text-wb-ink-mute">{plugin.description}</p>
						{/if}
					</div>
					<button
						type="button"
						class={secondary}
						disabled={manager.busy !== null}
						onclick={() => manager.install(plugin)}
					>
						{manager.busy === plugin.id ? 'Installing…' : 'Install'}
					</button>
				</li>
			{:else}
				{#if !manager.loading}
					<li class="py-2 text-xs text-wb-ink-mute">
						{manager.query ? 'No marketplace plugins match.' : 'No other marketplace plugins.'}
					</li>
				{/if}
			{/each}
		</ul>
	</div>
</section>
