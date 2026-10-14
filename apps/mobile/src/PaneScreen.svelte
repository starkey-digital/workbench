<script lang="ts">
	import { ViewBoundary } from '@workbench/ui/view-boundary';
	import { captureViewError } from '@workbench/telemetry';
	import ChatScreen from './ChatScreen.svelte';
	import { useBack } from './back-navigation';
	import type { MobileClient } from './client.svelte.ts';
	import type { PaneEntry } from './panes.ts';
	import { paneTitle } from './panes.ts';
	import PaneWaiting from './PaneWaiting.svelte';
	import Terminal from './Terminal.svelte';

	/** One pane of the host's model: its terminal, its chat, or why neither is up yet. */
	let { client, entry }: { client: MobileClient; entry: PaneEntry } = $props();

	const pane = $derived(entry.pane);
	const view = $derived(client.paneView(pane));
	const chatReady = $derived(pane.status === 'running' && !!pane.sessionId);
	// One owner for every view, so Back still works when a view fails to render.
	useBack(() => client.closeScreen());
</script>

{#if view === 'terminal' && pane.terminalId}
	{#key pane.terminalId}
		<ViewBoundary label="terminal" onerror={(e) => captureViewError('terminal', e)}>
			<Terminal
				serverUrl={client.connection?.url ?? ''}
				token={client.connection?.token ?? ''}
				id={pane.terminalId}
				name={paneTitle(entry)}
				onClose={client.closeScreen}
				onShowChat={pane.kind === 'claude' ? () => client.setView(pane.id, 'chat') : undefined}
				notice={client.notice}
			/>
		</ViewBoundary>
	{/key}
{:else if view === 'chat' && chatReady}
	<ChatScreen {client} {entry} />
{:else}
	<PaneWaiting {client} {entry} />
{/if}
