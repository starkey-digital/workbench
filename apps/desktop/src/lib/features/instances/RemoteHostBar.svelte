<script lang="ts">
	import { AgentIcon } from '@workbench/ui/agent-icon';
	import { Button } from '@workbench/ui/button';
	import * as DropdownMenu from '@workbench/ui/dropdown-menu';
	import ArrowUpCircleIcon from '@lucide/svelte/icons/circle-arrow-up';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import type { HostUpdate } from '@workbench/control-plane-ui';
	import type { RemoteSession } from './remote-session.svelte';

	/** The host's account for new Claude sessions, and its Workbench version with Update (after a confirm). */
	let { session, update }: { session: RemoteSession; update: HostUpdate } = $props();

	let confirming = $state(false);

	const accounts = $derived([
		{ id: undefined, name: session.defaultAccountName },
		...session.claudeAccounts.map((a) => ({ id: a.id as string | undefined, name: a.name }))
	]);
	const active = $derived(accounts.find((a) => a.id === session.activeAccountId) ?? accounts[0]);
	const available = $derived(update.updating ? undefined : update.status?.available);
</script>

<div class="shrink-0 border-t border-wb-hair bg-wb-rail">
	{#if confirming && available}
		<div class="flex flex-col gap-2 border-b border-wb-hair px-3 py-2">
			<p class="text-[11px] leading-snug text-wb-ink-mute">
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
		</div>
	{/if}
	{#each [session.accountError, update.error] as error, i (i)}
		{#if error}
			<p role="alert" class="px-3 pt-1.5 text-[10.5px] text-wb-err">{error}</p>
		{/if}
	{/each}
	<div class="flex h-7 items-center gap-2 px-2 font-mono text-[10.5px] text-wb-ink-mute">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-wb-panel2 hover:text-wb-ink"
				title="Claude account for new sessions on this host"
			>
				<AgentIcon agent="claude" class="size-3 shrink-0" />
				<span class="truncate">{active.name}</span>
				<ChevronUpIcon class="size-2.5 shrink-0" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="min-w-52" align="start" side="top">
				<DropdownMenu.Label class="text-xs text-wb-ink-soft">
					New Claude sessions on this host use
				</DropdownMenu.Label>
				{#each accounts as account (account.id ?? '')}
					<DropdownMenu.Item onSelect={() => void session.setActiveAccount(account.id)}>
						<CheckIcon
							class={['size-3.5', account.id !== session.activeAccountId && 'invisible']}
						/>
						<span class="truncate">{account.name}</span>
					</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Separator />
				<p class="px-2 py-1 text-[10.5px] text-wb-ink-soft">
					Add accounts or log in on the host itself.
				</p>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<span class="flex-1"></span>

		{#if update.updating}
			<span class="animate-pulse text-wb-warn">Updating host…</span>
		{:else if available}
			<button
				class="flex items-center gap-1 rounded px-1 py-0.5 text-wb-accent transition-colors hover:bg-wb-panel2"
				type="button"
				title="Update this host to v{available}"
				onclick={() => (confirming = !confirming)}
			>
				<ArrowUpCircleIcon class="size-3" />
				v{available}
			</button>
		{/if}
		{#if update.status}
			<span class="text-wb-ink-soft" title="Workbench on this host">v{update.status.current}</span>
		{/if}
	</div>
</div>
