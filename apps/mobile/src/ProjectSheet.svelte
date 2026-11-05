<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderGitIcon from '@lucide/svelte/icons/folder-git-2';
	import FolderPlusIcon from '@lucide/svelte/icons/folder-plus';
	import { onMount } from 'svelte';
	import { baseName, type ProjectConfig } from '@workbench/types';
	import { NewProjectFlow } from '@workbench/control-plane-ui';
	import type { MobileClient } from './client.svelte';
	import { tildePath } from './home-format';
	import {
		accountFromOption,
		accountOption,
		DEFAULT_LOGIN,
		FOLLOW_ACTIVE,
		unknownAccount
	} from './project-sheet.svelte';
	import RepoPicker from './RepoPicker.svelte';
	import Sheet from './Sheet.svelte';

	/** Adds a project (an existing host folder, a new one, or a clone) or edits `project`. */
	let {
		client,
		project,
		onClose,
		onRemoved
	}: {
		client: MobileClient;
		/** Absent: add a new one. */
		project?: ProjectConfig;
		onClose: () => void;
		onRemoved: (path: string) => void;
	} = $props();

	const store = $derived(client.store!);
	// Seeded once: the sheet is mounted per open.
	// svelte-ignore state_referenced_locally
	let current = $state.raw(project);
	/** `current` was made by this sheet (a new folder or a clone), so it's already saved. */
	let justAdded = $state(false);
	// svelte-ignore state_referenced_locally
	let path = $state(project?.path ?? '');
	// svelte-ignore state_referenced_locally
	let name = $state(project?.name ?? '');
	// svelte-ignore state_referenced_locally
	let group = $state(project?.group ?? '');
	// svelte-ignore state_referenced_locally
	let account = $state(accountOption(project?.claudeAccountId));
	let saving = $state(false);
	let confirmingRemove = $state(false);
	let newFolderOpen = $state(false);
	let error = $state<string | null>(null);

	// svelte-ignore state_referenced_locally
	const flow = project ? null : new NewProjectFlow(store);
	const groups = $derived([...new Set(store.projects.flatMap((p) => (p.group ? [p.group] : [])))]);
	const picking = $derived(!path);
	const hereName = $derived(flow?.here ? baseName(flow.here) || flow.here : 'this folder');

	// The host's accounts can change while the phone is connected: the picker shows them fresh.
	onMount(() => void client.loadAccounts());

	/** Made and saved by the host: carry on with its name, group and account. */
	async function make(step: Promise<void>) {
		await step;
		const made = flow?.added;
		if (!made) return;
		current = made;
		justAdded = true;
		path = made.path;
		name = made.name;
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		error = null;
		const edit = {
			path,
			name: name.trim(),
			group: group.trim() || undefined,
			claudeAccountId: accountFromOption(account)
		};
		try {
			await (current ? store.updateProject(edit) : store.addProject(edit));
			onClose();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!current) return;
		saving = true;
		error = null;
		try {
			await store.removeProject(current.path);
			onRemoved(current.path);
			onClose();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			confirmingRemove = false;
		} finally {
			saving = false;
		}
	}

	const field =
		'h-10 rounded-lg border border-wb-hair bg-wb-panel2 px-3 text-[13.5px] font-normal text-wb-ink placeholder:text-wb-ink-soft focus:border-wb-ink-soft focus:outline-none';
	const label = 'flex flex-col gap-1.5 text-[12px] font-semibold text-wb-ink-mute';
	const primary =
		'flex h-10 items-center justify-center gap-1.5 rounded-lg bg-wb-accent text-[13px] font-semibold text-wb-accent-ink active:brightness-90 disabled:opacity-50';
	const title = $derived(
		current
			? justAdded
				? 'Project added'
				: 'Edit project'
			: !picking
				? 'Add project'
				: flow?.mode === 'clone'
					? 'Clone a repository'
					: 'Pick a folder'
	);
</script>

<Sheet
	label={current ? `Edit ${current.name}` : 'Add project'}
	onClose={flow?.busy ? undefined : onClose}
>
	<div class="flex flex-col gap-3 text-sm">
		<div class="flex items-center gap-2">
			<h2 class="min-w-0 flex-1 truncate font-semibold">{title}</h2>
			<button
				type="button"
				class="h-9 rounded-lg border border-wb-hair px-3 text-xs disabled:opacity-50"
				disabled={flow?.busy}
				onclick={onClose}>{justAdded ? 'Close' : 'Cancel'}</button
			>
		</div>

		{#if flow && picking}
			{@const listing = flow.browser.listing}
			<div class="flex gap-1 rounded-lg bg-wb-panel2 p-0.5" role="tablist">
				{#each [['folder', 'Folder'], ['clone', 'Clone']] as const as [mode, text] (mode)}
					<button
						type="button"
						role="tab"
						aria-selected={flow.mode === mode}
						class={[
							'h-8 flex-1 rounded-md text-[12.5px] font-medium',
							flow.mode === mode ? 'bg-wb-panel text-wb-ink shadow-sm' : 'text-wb-ink-soft'
						]}
						disabled={flow.busy}
						onclick={() => flow.setMode(mode)}>{text}</button
					>
				{/each}
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					class="grid size-9 shrink-0 place-items-center rounded-lg border border-wb-hair active:bg-wb-panel2 disabled:opacity-40"
					aria-label="Up one folder"
					disabled={!listing?.parent || flow.browser.loading || flow.busy}
					onclick={() => flow.browser.open(listing?.parent ?? undefined)}
				>
					<ArrowUpIcon class="size-4" />
				</button>
				<span class="min-w-0 flex-1 truncate font-mono text-xs text-wb-ink-mute"
					>{listing ? tildePath(listing.path) : '…'}</span
				>
			</div>
			{#if flow.browser.error}<p class="text-xs break-words text-wb-err" role="alert">
					{flow.browser.error}
				</p>{/if}
			<ul
				class={[
					'flex flex-col overflow-y-auto rounded-lg border border-wb-hair-soft',
					flow.mode === 'clone' ? 'max-h-[22vh]' : 'max-h-[38vh]'
				]}
			>
				{#each listing?.folders ?? [] as folder (folder.path)}
					<li class="border-b border-wb-hair-soft last:border-b-0">
						<button
							type="button"
							class="flex min-h-11 w-full items-center gap-2.5 px-3 text-left active:bg-wb-panel2"
							disabled={flow.busy}
							onclick={() => flow.browser.open(folder.path)}
						>
							{#if folder.git}
								<FolderGitIcon class="size-4 shrink-0 text-wb-accent" />
							{:else}
								<FolderIcon class="size-4 shrink-0 text-wb-ink-soft" />
							{/if}
							<span class="min-w-0 flex-1 truncate text-[13.5px]">{folder.name}</span>
							{#if flow.isProject(folder.path)}<span class="shrink-0 text-[11px] text-wb-ink-soft"
									>Added</span
								>{/if}
						</button>
					</li>
				{:else}
					<li class="px-3 py-3 text-xs text-wb-ink-soft" role="status">
						{flow.browser.loading ? 'Loading…' : 'No folders here.'}
					</li>
				{/each}
			</ul>

			{#if flow.mode === 'folder'}
				<button
					type="button"
					class={primary}
					disabled={!flow.here || flow.hereIsProject || flow.busy}
					onclick={() => {
						if (flow.here) path = flow.here;
					}}
				>
					{flow.hereIsProject ? 'Already a project' : `Use ${hereName}`}
				</button>
				{#if newFolderOpen}
					<form
						class="flex flex-col gap-2 rounded-lg border border-wb-hair-soft p-3"
						onsubmit={(e) => {
							e.preventDefault();
							void make(flow.createHere());
						}}
					>
						<label class={label}
							>New folder in {hereName}
							<!-- svelte-ignore a11y_autofocus -->
							<input
								class={field}
								bind:value={flow.newFolder}
								placeholder="my-project"
								autocapitalize="off"
								autocorrect="off"
								spellcheck={false}
								autofocus
								disabled={flow.busy}
							/>
						</label>
						<label class="flex min-h-9 items-center gap-2.5 text-[13px] text-wb-ink-mute">
							<input
								type="checkbox"
								class="size-4 accent-wb-accent"
								bind:checked={flow.gitInit}
								disabled={flow.busy}
							/>
							Make it a git repository
						</label>
						<button
							type="submit"
							class={primary}
							disabled={!flow.here || !flow.newFolder.trim() || flow.busy}
						>
							<FolderPlusIcon class="size-4" />{flow.busy ? 'Creating…' : 'Create and add'}
						</button>
					</form>
				{:else}
					<button
						type="button"
						class="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-wb-hair text-[13px] font-medium text-wb-ink-mute active:bg-wb-panel2 disabled:opacity-50"
						disabled={!flow.here}
						onclick={() => (newFolderOpen = true)}
					>
						<FolderPlusIcon class="size-4" />New folder in {hereName}
					</button>
				{/if}
			{:else}
				<RepoPicker {flow} />
				<button
					type="button"
					class={primary}
					disabled={!flow.here || !flow.cloneUrl || flow.busy}
					onclick={() => make(flow.cloneHere())}
				>
					{#if flow.busy}
						<span class="spinner size-3.5"></span>Cloning…
					{:else}
						<DownloadIcon class="size-4" />Clone into {hereName}
					{/if}
				</button>
				<p class="text-[11.5px] text-wb-ink-soft">
					Clones on the host with its own git and <span class="font-mono">gh</span> login, into a new
					folder named after the repository.
				</p>
			{/if}
			{#if flow.error}<p class="text-xs break-words text-wb-err" role="alert">{flow.error}</p>{/if}
		{:else}
			<form class="flex flex-col gap-3" onsubmit={save}>
				<div class="flex items-center gap-2">
					<span class="min-w-0 flex-1 truncate font-mono text-xs text-wb-ink-mute"
						>{tildePath(path)}</span
					>
					{#if !current}
						<button
							type="button"
							class="shrink-0 text-xs text-wb-accent"
							onclick={() => (path = '')}>Change</button
						>
					{/if}
				</div>
				{#if justAdded}
					<p class="text-xs text-wb-ink-mute">
						It's on the host now. Name it, file it in a group, or just close.
					</p>
				{/if}
				<label class={label}
					>Name
					<input class={field} bind:value={name} placeholder={baseName(path)} />
				</label>
				<label class={label}
					>Group
					<input
						class={field}
						bind:value={group}
						list="project-groups"
						placeholder="None"
						autocapitalize="words"
					/>
					<datalist id="project-groups">
						{#each groups as g (g)}<option value={g}></option>{/each}
					</datalist>
				</label>
				{#if client.accounts.length || unknownAccount(account, client.accounts)}
					<label class={label}
						>Claude account for new sessions
						<select class={field} bind:value={account}>
							<option value={FOLLOW_ACTIVE}>Active account</option>
							<option value={DEFAULT_LOGIN}>{client.defaultAccountName}</option>
							{#each client.accounts as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
							{#if unknownAccount(account, client.accounts)}
								<option value={account}>Account not on this phone ({account})</option>
							{/if}
						</select>
					</label>
				{/if}
				{#if error}<p class="text-xs break-words text-wb-err" role="alert">{error}</p>{/if}
				<button type="submit" class={primary} disabled={saving}>
					{current ? 'Save' : 'Add project'}
				</button>
			</form>
			{#if current}
				{#if confirmingRemove}
					<div class="flex flex-col gap-2 rounded-lg border border-wb-err/40 p-3">
						<p class="text-xs text-wb-ink-mute">
							Remove {current.name} from Workbench? Its open sessions end; the folder stays on disk.
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								class="h-9 flex-1 rounded-lg bg-wb-err/15 text-[13px] font-semibold text-wb-err disabled:opacity-50"
								disabled={saving}
								onclick={remove}>Remove</button
							>
							<button
								type="button"
								class="h-9 flex-1 rounded-lg border border-wb-hair text-[13px] text-wb-ink-mute"
								onclick={() => (confirmingRemove = false)}>Keep</button
							>
						</div>
					</div>
				{:else}
					<button
						type="button"
						class="h-10 rounded-lg border border-wb-hair text-[13px] font-medium text-wb-err active:bg-wb-panel2"
						onclick={() => (confirmingRemove = true)}>Remove project</button
					>
				{/if}
			{/if}
		{/if}
	</div>
</Sheet>
