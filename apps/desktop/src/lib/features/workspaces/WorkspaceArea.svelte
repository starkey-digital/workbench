<script lang="ts">
	import EmptyState from '$components/EmptyState.svelte';
	import NativeTerminalGrid from '$features/terminal/NativeTerminalGrid.svelte';
	import TerminalGrid from '$features/terminal/TerminalGrid.svelte';
	import TerminalTabs from '$features/terminal/TerminalTabs.svelte';
	import { splitInset, visibleSplit } from '$features/terminal/split-view';
	import PersistenceBanner from '$features/workspaces/PersistenceBanner.svelte';
	import WorkspaceLanding from '$features/workspaces/WorkspaceLanding.svelte';
	import WorkspaceTabs from '$features/workspaces/WorkspaceTabs.svelte';
	import { getWorkbenchServer, getWorkspaceStore } from '$stores/context';
	import { effectivePath } from '$lib/utils/path';
	import type { ProjectConfig, ProjectWorkspace } from '$types/workbench';

	/** The workspaces of the server in context, each with its tabs and panes. */
	let { projectFor }: { projectFor: (ws: ProjectWorkspace) => ProjectConfig | undefined } =
		$props();

	const workspaceStore = getWorkspaceStore();
	const server = getWorkbenchServer();
</script>

<PersistenceBanner />
{#if workspaceStore.workspaces.length === 0}
	<EmptyState />
{:else}
	<WorkspaceTabs />

	{#each workspaceStore.workspaces as ws (ws.id)}
		{@const isActiveWs = ws.id === workspaceStore.activeWorkspaceId}
		{@const activeTab =
			ws.terminalTabs.find((t) => t.id === ws.activeTerminalTabId) ?? ws.terminalTabs[0]}
		{@const wsProject = projectFor(ws)}
		{@const split = visibleSplit(ws)}
		<div class="flex min-h-0 flex-1 flex-col" class:hidden={!isActiveWs}>
			{#if activeTab && wsProject}
				<TerminalTabs workspace={ws} />

				<div class="relative min-h-0 flex-1">
					{#each ws.terminalTabs as tab (tab.id)}
						{@const isActiveTab = tab.id === ws.activeTerminalTabId}
						{@const inSplit = split?.tabs.some((t) => t.id === tab.id) ?? false}
						{@const isShown = (isActiveTab || inSplit) && isActiveWs}
						<!-- Clicking into a split half makes its tab the active one. -->
						<div
							class={[
								'absolute flex',
								isShown ? 'z-10' : 'invisible z-0',
								split?.tabs[1].id === tab.id &&
									(split.direction === 'horizontal'
										? 'border-l border-wb-hair'
										: 'border-t border-wb-hair')
							]}
							style:inset={splitInset(split, tab.id)}
							onfocusin={() => {
								if (inSplit && !isActiveTab) workspaceStore.setActiveTab(ws.id, tab.id);
							}}
						>
							{#if ws.renderer === 'native' && !server.remote}
								<NativeTerminalGrid {tab} active={isShown} cwd={effectivePath(ws)} />
							{:else}
								<TerminalGrid
									workspaceId={ws.id}
									{tab}
									active={isShown}
									project={wsProject}
									cwd={ws.worktreePath}
								/>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<WorkspaceLanding workspace={ws} />
			{/if}
		</div>
	{/each}
{/if}
