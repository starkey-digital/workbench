<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { projectSections, type ControlPlaneStore } from '@workbench/control-plane-ui';
	import { Input } from '@workbench/ui/input';
	import { ScrollArea } from '@workbench/ui/scroll-area';
	import { watch } from 'runed';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import SessionBadges from '$features/projects/SessionBadges.svelte';
	import SessionItem from '$features/projects/SessionItem.svelte';
	import type { ActiveClaudeSession, ProjectConfig } from '$types/workbench';
	import RemoteProjectAccount from './RemoteProjectAccount.svelte';
	import type { RemoteSession } from './remote-session.svelte';
	import { projectBranches, type BranchRow } from './remote-tree';

	/** A remote server's projects, branches and sessions, laid out like `ProjectSidebar`. */
	let { store, session }: { store: ControlPlaneStore; session: RemoteSession } = $props();

	const noFavourites: ReadonlySet<string> = new Set();
	// Explicit per-project toggles; the rest follow "is active or has sessions".
	const expandedProjects = new SvelteMap<string, boolean>();
	const collapsedSections = new SvelteSet<string>();

	let filterText = $state('');
	let creatingIn = $state<string | null>(null);
	let newBranch = $state('');

	const sections = $derived(projectSections(store.projects, noFavourites, filterText));
	const active = $derived(session.workspaces.activeWorkspace);

	function sessionsFor(path: string): ActiveClaudeSession[] {
		return session.sessions.activeSessionsByProject[path] ?? [];
	}

	function expandedByDefault(path: string): boolean {
		return active?.projectPath === path || sessionsFor(path).length > 0;
	}

	function isExpanded(path: string): boolean {
		return expandedProjects.get(path) ?? expandedByDefault(path);
	}

	function toggle(path: string) {
		const next = !isExpanded(path);
		if (next === expandedByDefault(path)) expandedProjects.delete(path);
		else expandedProjects.set(path, next);
	}

	// Branches load when a project first shows expanded, however it got there (once per path).
	watch(
		() => store.projects.filter((p) => isExpanded(p.path)).map((p) => p.path),
		(paths) => {
			for (const path of paths) void store.ensureWorktrees(path);
		}
	);

	// The typed name stays when the host refuses it, so it can be fixed.
	async function createWorktree(project: ProjectConfig) {
		const branch = newBranch.trim();
		if (!branch || (await store.createWorktree(project.path, branch)) === undefined) return;
		creatingIn = null;
		newBranch = '';
	}
</script>

{#if store.projects.length > 0}
	<div class="relative shrink-0 px-2 pt-2 pb-1">
		<SearchIcon
			class="pointer-events-none absolute top-[calc(50%+2px)] left-4 size-3 -translate-y-1/2 text-wb-ink-mute"
		/>
		<Input
			bind:value={filterText}
			placeholder="Filter projects…"
			aria-label="Filter projects"
			class="h-[26px] border-wb-hair bg-wb-bg pr-6 pl-7 font-mono text-[11px] text-wb-ink placeholder:text-wb-ink-mute focus-visible:ring-wb-accent/40"
		/>
		{#if filterText}
			<button
				type="button"
				class="absolute top-[calc(50%+2px)] right-4 -translate-y-1/2 rounded p-0.5 text-wb-ink-mute hover:text-wb-ink"
				aria-label="Clear filter"
				onclick={() => (filterText = '')}
			>
				<XIcon class="size-2.5" />
			</button>
		{/if}
	</div>
{/if}

{#if store.error}
	<p class="mx-2 mt-1 rounded bg-wb-err/10 px-2 py-1 font-mono text-[11px] text-wb-err">
		{store.error}
	</p>
{/if}

<ScrollArea class="min-h-0 flex-1">
	<div class="pt-1 pb-2">
		{#if store.projects.length === 0}
			<p class="px-3 py-8 text-center font-mono text-[11px] text-wb-ink-mute">
				No projects on this server.
			</p>
		{:else if sections.length === 0}
			<p class="px-3 py-4 text-center font-mono text-[11px] text-wb-ink-mute">No matches.</p>
		{:else}
			{#each sections as section (section.key)}
				{#if sections.length > 1}
					{@const collapsed = collapsedSections.has(section.key) && !filterText}
					<button
						class="mt-2 flex w-full items-center gap-1 px-3 py-1 text-left first:mt-0"
						type="button"
						aria-expanded={!collapsed}
						onclick={() =>
							collapsedSections.has(section.key)
								? collapsedSections.delete(section.key)
								: collapsedSections.add(section.key)}
					>
						{#if collapsed}
							<ChevronRightIcon class="size-3 shrink-0 text-wb-ink-mute" />
						{:else}
							<ChevronDownIcon class="size-3 shrink-0 text-wb-ink-mute" />
						{/if}
						<span
							class="truncate text-[10px] font-semibold tracking-wider text-wb-ink-mute uppercase"
							>{section.title}</span
						>
						<span class="ml-auto font-mono text-[10px] text-wb-ink-mute"
							>{section.projects.length}</span
						>
					</button>
					{#if !collapsed}
						{#each section.projects as project (project.path)}
							{@render projectRow(project)}
						{/each}
					{/if}
				{:else}
					{#each section.projects as project (project.path)}
						{@render projectRow(project)}
					{/each}
				{/if}
			{/each}
		{/if}
	</div>
</ScrollArea>

{#snippet projectRow(project: ProjectConfig)}
	{@const isActive = active?.projectPath === project.path}
	{@const expanded = isExpanded(project.path)}
	<div role="listitem">
		<div
			class={[
				'group flex h-7 items-center gap-1.5 border-l-2 pr-1.5 pl-2 transition-colors',
				isActive
					? 'border-l-wb-accent bg-wb-panel2 text-wb-ink'
					: 'border-l-transparent text-wb-ink-mute hover:bg-wb-panel2/60 hover:text-wb-ink'
			]}
		>
			<button
				class="flex size-4 shrink-0 items-center justify-center rounded text-wb-ink-mute hover:text-wb-ink"
				type="button"
				aria-label={expanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
				aria-expanded={expanded}
				onclick={() => toggle(project.path)}
			>
				{#if expanded}
					<ChevronDownIcon class="size-3" />
				{:else}
					<ChevronRightIcon class="size-3" />
				{/if}
			</button>
			<button
				class={[
					'min-w-0 flex-1 truncate text-left font-mono text-[12px]',
					isActive && 'font-semibold'
				]}
				type="button"
				title={project.path}
				onclick={() => void session.open(project)}
			>
				{project.name}
			</button>
			<SessionBadges sessions={sessionsFor(project.path)} />
			<RemoteProjectAccount {project} {session} />
			{@render newSessionButton(project.name, () => void session.newSession(project))}
		</div>
		{#if expanded}
			{@render branchTree(project)}
		{/if}
	</div>
{/snippet}

<!-- main checkout first, then each worktree; sessions nest under the branch they run on -->
{#snippet branchTree(project: ProjectConfig)}
	{@const branches = projectBranches(
		store.worktrees[project.path],
		sessionsFor(project.path),
		(path) => session.workspaces.getByWorktreePath(path)?.branch
	)}
	<div class="mb-1 ml-[15px] border-l border-wb-hair">
		<!-- no main worktree = not a git repo (or not loaded yet): sessions only -->
		{#if branches.main}
			{@render branchRow(project, branches.main)}
		{:else}
			{@render sessionList(project, branches.loose)}
		{/if}
		{#each branches.worktrees as row (row.path)}
			{@render branchRow(project, row)}
		{/each}
		{#if branches.main}
			{#if creatingIn === project.path}
				<form
					class="flex h-6 items-center gap-1.5 px-2.5"
					onsubmit={(e) => {
						e.preventDefault();
						void createWorktree(project);
					}}
				>
					<GitBranchIcon class="size-3 shrink-0 text-wb-ink-mute" />
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-wb-ink outline-none placeholder:text-wb-ink-mute"
						placeholder="new-branch-name"
						aria-label="New worktree branch"
						autocapitalize="off"
						autocorrect="off"
						spellcheck={false}
						autofocus
						bind:value={newBranch}
						onkeydown={(e) => e.key === 'Escape' && (creatingIn = null)}
						onblur={() => !newBranch.trim() && (creatingIn = null)}
					/>
				</form>
			{:else}
				<button
					class="flex h-6 w-full items-center gap-1.5 px-2.5 text-left font-mono text-[11px] text-wb-ink-mute transition-colors hover:bg-wb-panel2 hover:text-wb-ink"
					type="button"
					onclick={() => {
						newBranch = '';
						creatingIn = project.path;
					}}
				>
					<PlusIcon class="size-3 shrink-0" />
					worktree
				</button>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet branchRow(project: ProjectConfig, row: BranchRow)}
	{@const { worktree, branch } = row}
	{@const isActive =
		active?.projectPath === project.path && (active.worktreePath ?? undefined) === worktree?.path}
	<div
		class={[
			'group flex h-[26px] items-center gap-1.5 pr-1.5 pl-2.5 font-mono text-[12px] transition-colors',
			isActive
				? 'bg-wb-accent-soft text-wb-ink'
				: 'text-wb-ink-mute hover:bg-wb-panel2/60 hover:text-wb-ink'
		]}
	>
		<GitBranchIcon class={['size-3 shrink-0', isActive ? 'text-wb-accent' : 'text-wb-ink-mute']} />
		<button
			class="min-w-0 flex-1 truncate text-left"
			type="button"
			title={row.path}
			onclick={() => void session.open(project, worktree)}
		>
			{branch}
		</button>
		<SessionBadges sessions={row.sessions} />
		{@render newSessionButton(branch, () => void session.newSession(project, worktree))}
	</div>
	{@render sessionList(project, row.sessions)}
{/snippet}

{#snippet sessionList(project: ProjectConfig, sessions: ActiveClaudeSession[])}
	{#each sessions as s (s.tabId)}
		<div class="pl-5">
			<SessionItem
				session={s}
				onSelect={() => session.workspaces.selectTabByProject(project.path, s.tabId)}
				onRestart={() =>
					session.sessions.restartSessionByProject(project.path, s.tabId, s.sessionType)}
				onClose={() => session.workspaces.closeTabByProject(project.path, s.tabId)}
			/>
		</div>
	{/each}
{/snippet}

{#snippet newSessionButton(name: string, onclick: () => void)}
	<button
		class="grid size-5 shrink-0 place-items-center rounded text-wb-ink-mute opacity-0 transition-opacity group-hover:opacity-100 hover:bg-wb-panel2 hover:text-wb-ink focus-visible:opacity-100"
		type="button"
		aria-label="New session on {name}"
		title="New Claude session"
		{onclick}
	>
		<PlusIcon class="size-3" />
	</button>
{/snippet}
